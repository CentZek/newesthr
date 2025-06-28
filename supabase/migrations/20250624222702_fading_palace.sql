/*
  # Fix Manual Entry Display Times
  
  1. Changes
    - Fix the issue where manual entries show "Missing" for check-in and check-out times
    - Create and update trigger functions to ensure proper display values
    - Update existing manual entries with correct standard display times
    
  2. Data Integrity
    - Ensures consistent display times based on shift type
    - Fixes all existing records with incorrect or missing display values
    - Makes manual entry display consistent between Face ID Data and Approved Hours views
*/

-- Add approved column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_records' AND column_name = 'approved'
  ) THEN
    ALTER TABLE time_records ADD COLUMN approved BOOLEAN DEFAULT FALSE NOT NULL;
  END IF;
END $$;

-- Create index for approved column
CREATE INDEX IF NOT EXISTS idx_time_records_approved ON time_records (approved);

-- Create function to standardize manual entry display times
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
    NEW.approved := FALSE;
    
    RAISE NOTICE 'Setting manual entry display values: % % %', 
      NEW.shift_type, NEW.display_check_in, NEW.display_check_out;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to apply the function to all new manual entries
DROP TRIGGER IF EXISTS trg_standardize_manual_entry_display_times ON time_records;
CREATE TRIGGER trg_standardize_manual_entry_display_times
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION standardize_manual_entry_display_times();

-- Create a function to standardize manual shift times
CREATE OR REPLACE FUNCTION standardize_manual_shift_times()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process manual entries
  IF NEW.is_manual_entry = TRUE THEN
    -- Set standard display times based on shift type
    IF NEW.shift_type IS NOT NULL THEN
      -- Apply proper times based on shift type
      IF NEW.shift_type = 'morning' THEN
        NEW.display_check_in := '05:00';
        NEW.display_check_out := '14:00';
      ELSIF NEW.shift_type = 'evening' THEN
        NEW.display_check_in := '13:00';
        NEW.display_check_out := '22:00';
      ELSIF NEW.shift_type = 'night' THEN
        NEW.display_check_in := '21:00';
        NEW.display_check_out := '06:00';
      ELSIF NEW.shift_type = 'canteen' AND EXTRACT(HOUR FROM NEW.timestamp) = 7 THEN
        NEW.display_check_in := '07:00';
        NEW.display_check_out := '16:00';
      ELSIF NEW.shift_type = 'canteen' THEN
        NEW.display_check_in := '08:00';
        NEW.display_check_out := '17:00';
      END IF;
    END IF;
    
    -- Ensure working_week_start is set properly for night shifts
    IF NEW.shift_type = 'night' THEN
      IF NEW.status = 'check_out' AND EXTRACT(HOUR FROM NEW.timestamp) < 12 THEN
        NEW.working_week_start := (NEW.timestamp::date - INTERVAL '1 day')::date;
      ELSE
        NEW.working_week_start := NEW.timestamp::date;
      END IF;
    ELSE
      NEW.working_week_start := NEW.timestamp::date;
    END IF;
    
    -- Set exact hours to 9.00 if not specified
    IF NEW.exact_hours IS NULL THEN
      NEW.exact_hours := 9.00;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for standardizing shift times
DROP TRIGGER IF EXISTS trg_standardize_manual_shift_times ON time_records;
CREATE TRIGGER trg_standardize_manual_shift_times
  BEFORE INSERT ON time_records
  FOR EACH ROW
  WHEN (NEW.is_manual_entry = true)
  EXECUTE FUNCTION standardize_manual_shift_times();

-- Fix all existing manual entries with incorrect display times
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

-- Create a function to mark records as approved when set
CREATE OR REPLACE FUNCTION mark_approved_records()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure manual entries have proper display values when approved
  IF NEW.is_manual_entry = TRUE THEN
    -- Fix display values based on shift type
    IF NEW.shift_type = 'morning' AND 
       (NEW.display_check_in IS NULL OR NEW.display_check_in = 'Missing' OR 
        NEW.display_check_out IS NULL OR NEW.display_check_out = 'Missing') THEN
      NEW.display_check_in := '05:00';
      NEW.display_check_out := '14:00';
    ELSIF NEW.shift_type = 'evening' AND 
         (NEW.display_check_in IS NULL OR NEW.display_check_in = 'Missing' OR 
          NEW.display_check_out IS NULL OR NEW.display_check_out = 'Missing') THEN
      NEW.display_check_in := '13:00';
      NEW.display_check_out := '22:00';
    ELSIF NEW.shift_type = 'night' AND 
         (NEW.display_check_in IS NULL OR NEW.display_check_in = 'Missing' OR 
          NEW.display_check_out IS NULL OR NEW.display_check_out = 'Missing') THEN
      NEW.display_check_in := '21:00';
      NEW.display_check_out := '06:00';
    ELSIF NEW.shift_type = 'canteen' THEN
      -- For canteen shifts, determine if it's 7AM or 8AM
      IF EXTRACT(HOUR FROM NEW.timestamp) = 7 AND 
         (NEW.display_check_in IS NULL OR NEW.display_check_in = 'Missing' OR 
          NEW.display_check_out IS NULL OR NEW.display_check_out = 'Missing') THEN
        NEW.display_check_in := '07:00';
        NEW.display_check_out := '16:00';
      ELSIF (NEW.display_check_in IS NULL OR NEW.display_check_in = 'Missing' OR 
            NEW.display_check_out IS NULL OR NEW.display_check_out = 'Missing') THEN
        NEW.display_check_in := '08:00';
        NEW.display_check_out := '17:00';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for mark_approved_records
DROP TRIGGER IF EXISTS trg_mark_approved_records ON time_records;
CREATE TRIGGER trg_mark_approved_records
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION mark_approved_records();