/*
  # Fix Manual Entry Display Times Issue
  
  1. Changes:
    - Fix manual entries showing "Missing" for check-in and check-out times
    - Ensure manual entries are NOT automatically approved
    - Fix database triggers to properly set display values
    
  2. Data Integrity:
    - Ensure proper display times based on shift type (05:00/14:00 for morning, etc.)
    - Fix existing records with "Missing" display values
    - Create triggers to prevent future issues
*/

-- Drop existing trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS trg_standardize_manual_entry_display_times ON time_records;
DROP TRIGGER IF EXISTS trg_standardize_manual_shift_times ON time_records;
DROP TRIGGER IF EXISTS trg_mark_approved_records ON time_records;

-- Create a new function to properly handle manual entry display times
CREATE OR REPLACE FUNCTION fix_manual_entry_display()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process manual entries
  IF NEW.is_manual_entry = TRUE THEN
    -- Set proper display values based on shift type
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
      -- Check for 7AM or 8AM canteen shift
      IF EXTRACT(HOUR FROM NEW.timestamp) = 7 THEN
        NEW.display_check_in := '07:00';
        NEW.display_check_out := '16:00';
      ELSE
        NEW.display_check_in := '08:00';
        NEW.display_check_out := '17:00';
      END IF;
    ELSIF NEW.shift_type = 'off_day' THEN
      -- For OFF-DAY or leave records
      IF NEW.notes = 'OFF-DAY' THEN
        NEW.display_check_in := 'OFF-DAY';
        NEW.display_check_out := 'OFF-DAY';
      ELSIF NEW.notes IS NOT NULL AND NEW.notes != 'OFF-DAY' THEN
        -- For leave types, use leave type as display value
        NEW.display_check_in := NEW.notes;
        NEW.display_check_out := NEW.notes;
      END IF;
    END IF;
    
    -- Always explicitly set manual entries to NOT approved
    NEW.approved := FALSE;
    
    RAISE NOTICE 'Manual entry processed: shift_type=%, display_check_in=%, display_check_out=%, approved=%',
      NEW.shift_type, NEW.display_check_in, NEW.display_check_out, NEW.approved;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a new trigger that fires on both INSERT and UPDATE
CREATE TRIGGER trg_fix_manual_entry_display
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION fix_manual_entry_display();

-- Fix existing manual entries with "Missing" display values
UPDATE time_records
SET 
  display_check_in = 
    CASE 
      WHEN shift_type = 'morning' THEN '05:00'
      WHEN shift_type = 'evening' THEN '13:00'
      WHEN shift_type = 'night' THEN '21:00'
      WHEN shift_type = 'canteen' AND extract(hour from timestamp) = 7 THEN '07:00'
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
      WHEN shift_type = 'canteen' AND extract(hour from timestamp) = 7 THEN '16:00'
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

-- Ensure all existing manual entries are NOT approved by default
UPDATE time_records
SET approved = FALSE
WHERE is_manual_entry = TRUE AND approved = TRUE;