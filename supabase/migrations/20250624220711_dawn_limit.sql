/*
  # Fix Manual Entry Display Times

  1. Changes:
    - Add a function and trigger to ensure manual entries display correct times
    - Update existing manual entries with appropriate standard display times
    - Fix issue where manual entries show "Missing" for check-in and check-out times
    
  2. Data Integrity:
    - Maintain consistency between the Face ID Data and Approved Hours views
    - Ensure manual entries follow the standard shift times display format
    - Prevent any records from being auto-approved
*/

-- Create function to standardize display times for manual entries
CREATE OR REPLACE FUNCTION standardize_manual_entry_display_times()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process manual entries
  IF NEW.is_manual_entry = TRUE THEN
    -- Apply standard display times based on shift type
    IF NEW.shift_type = 'morning' THEN
      NEW.display_check_in := '05:00';
      NEW.display_check_out := '14:00';
    ELSIF NEW.shift_type = 'evening' THEN
      NEW.display_check_in := '13:00';
      NEW.display_check_out := '22:00';
    ELSIF NEW.shift_type = 'night' THEN
      NEW.display_check_in := '21:00';
      NEW.display_check_out := '06:00';
    ELSIF NEW.shift_type = 'canteen' THEN
      -- Determine canteen shift type based on hour
      IF EXTRACT(HOUR FROM NEW.timestamp) = 7 THEN
        NEW.display_check_in := '07:00';
        NEW.display_check_out := '16:00';
      ELSE
        NEW.display_check_in := '08:00';
        NEW.display_check_out := '17:00';
      END IF;
    ELSIF NEW.shift_type = 'off_day' THEN
      -- For OFF-DAY or leave records, use appropriate display values
      IF NEW.notes = 'OFF-DAY' THEN
        NEW.display_check_in := 'OFF-DAY';
        NEW.display_check_out := 'OFF-DAY';
      ELSIF NEW.notes IS NOT NULL AND NEW.notes != 'OFF-DAY' THEN
        -- For leave types, use leave type as display value
        NEW.display_check_in := NEW.notes;
        NEW.display_check_out := NEW.notes;
      END IF;
    END IF;

    -- Always set manual entries to not approved by default
    -- This ensures they appear in the Face ID Data page for approval
    NEW.approved := FALSE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to apply the function to all new and updated manual entries
DROP TRIGGER IF EXISTS trg_standardize_manual_entry_display_times ON time_records;
CREATE TRIGGER trg_standardize_manual_entry_display_times
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION standardize_manual_entry_display_times();

-- Fix existing manual entries with incorrect display times
UPDATE time_records
SET 
  display_check_in = 
    CASE 
      WHEN shift_type = 'morning' THEN '05:00'
      WHEN shift_type = 'evening' THEN '13:00'
      WHEN shift_type = 'night' THEN '21:00'
      WHEN shift_type = 'canteen' AND EXTRACT(HOUR FROM timestamp) = 7 THEN '07:00'
      WHEN shift_type = 'canteen' THEN '08:00'
      WHEN shift_type = 'off_day' AND notes = 'OFF-DAY' THEN 'OFF-DAY'
      WHEN shift_type = 'off_day' AND notes IS NOT NULL AND notes != 'OFF-DAY' THEN notes
      ELSE display_check_in
    END,
  display_check_out = 
    CASE 
      WHEN shift_type = 'morning' THEN '14:00'
      WHEN shift_type = 'evening' THEN '22:00'
      WHEN shift_type = 'night' THEN '06:00'
      WHEN shift_type = 'canteen' AND EXTRACT(HOUR FROM timestamp) = 7 THEN '16:00'
      WHEN shift_type = 'canteen' THEN '17:00'
      WHEN shift_type = 'off_day' AND notes = 'OFF-DAY' THEN 'OFF-DAY'
      WHEN shift_type = 'off_day' AND notes IS NOT NULL AND notes != 'OFF-DAY' THEN notes
      ELSE display_check_out
    END,
  approved = FALSE
WHERE 
  is_manual_entry = TRUE
  AND (
    display_check_in IS NULL OR 
    display_check_in = 'Missing' OR
    display_check_out IS NULL OR 
    display_check_out = 'Missing'
  );

-- Also ensure all manual entries are set to not approved by default
UPDATE time_records
SET approved = FALSE
WHERE is_manual_entry = TRUE AND (approved IS NULL OR approved = TRUE);