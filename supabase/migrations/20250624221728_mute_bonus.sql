/*
  # Fix Manual Entry Display Times in Face ID Data
  
  1. Changes
    - Create trigger function to standardize manual entry display times
    - Add trigger to automatically apply function to all new records
    - Fix existing manual entry records to display correct times
    - Ensure display_check_in and display_check_out are never "Missing"
    
  2. Data Integrity
    - Set standard display times based on shift type (05:00/14:00 for morning, etc.)
    - Update existing records with missing display values
    - Create an approved column to control when records appear in Approved Hours
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

-- Create a trigger to apply the function to all new and updated manual entries
DROP TRIGGER IF EXISTS trg_standardize_manual_entry_display_times ON time_records;
CREATE TRIGGER trg_standardize_manual_entry_display_times
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION standardize_manual_entry_display_times();

-- Fix existing manual entries with incorrect display times
DO $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update morning shift records
  UPDATE time_records
  SET 
    display_check_in = '05:00',
    display_check_out = '14:00',
    approved = FALSE
  WHERE 
    is_manual_entry = TRUE 
    AND shift_type = 'morning'
    AND status IN ('check_in', 'check_out')
    AND (
      display_check_in IS NULL OR 
      display_check_in = 'Missing' OR
      display_check_out IS NULL OR 
      display_check_out = 'Missing' OR
      display_check_in != '05:00' OR
      display_check_out != '14:00'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % morning shift manual entries', updated_count;
  
  -- Update evening shift records
  UPDATE time_records
  SET 
    display_check_in = '13:00',
    display_check_out = '22:00',
    approved = FALSE
  WHERE 
    is_manual_entry = TRUE 
    AND shift_type = 'evening'
    AND status IN ('check_in', 'check_out')
    AND (
      display_check_in IS NULL OR 
      display_check_in = 'Missing' OR
      display_check_out IS NULL OR 
      display_check_out = 'Missing' OR
      display_check_in != '13:00' OR
      display_check_out != '22:00'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % evening shift manual entries', updated_count;
  
  -- Update night shift records
  UPDATE time_records
  SET 
    display_check_in = '21:00',
    display_check_out = '06:00',
    approved = FALSE
  WHERE 
    is_manual_entry = TRUE 
    AND shift_type = 'night'
    AND status IN ('check_in', 'check_out')
    AND (
      display_check_in IS NULL OR 
      display_check_in = 'Missing' OR
      display_check_out IS NULL OR 
      display_check_out = 'Missing' OR
      display_check_in != '21:00' OR
      display_check_out != '06:00'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % night shift manual entries', updated_count;
  
  -- Update early canteen shift records (7:00 AM)
  UPDATE time_records
  SET 
    display_check_in = '07:00',
    display_check_out = '16:00',
    approved = FALSE
  WHERE 
    is_manual_entry = TRUE 
    AND shift_type = 'canteen'
    AND EXTRACT(HOUR FROM timestamp) = 7
    AND status IN ('check_in', 'check_out')
    AND (
      display_check_in IS NULL OR 
      display_check_in = 'Missing' OR
      display_check_out IS NULL OR 
      display_check_out = 'Missing' OR
      display_check_in != '07:00' OR
      display_check_out != '16:00'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % early canteen shift manual entries', updated_count;
  
  -- Update late canteen shift records (8:00 AM)
  UPDATE time_records
  SET 
    display_check_in = '08:00',
    display_check_out = '17:00',
    approved = FALSE
  WHERE 
    is_manual_entry = TRUE 
    AND shift_type = 'canteen'
    AND (EXTRACT(HOUR FROM timestamp) = 8 OR EXTRACT(HOUR FROM timestamp) > 8 OR EXTRACT(HOUR FROM timestamp) < 7)
    AND status IN ('check_in', 'check_out')
    AND (
      display_check_in IS NULL OR 
      display_check_in = 'Missing' OR
      display_check_out IS NULL OR 
      display_check_out = 'Missing' OR
      display_check_in != '08:00' OR
      display_check_out != '17:00'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % late canteen shift manual entries', updated_count;
  
  -- Set any manual entries with NULL approved to FALSE (not approved)
  UPDATE time_records
  SET approved = FALSE
  WHERE is_manual_entry = TRUE AND approved IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Set % manual entries with NULL approved to FALSE', updated_count;

  -- Fix any records with NULL display values (set them based on shift type)
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
        WHEN shift_type = 'off_day' AND notes != 'OFF-DAY' THEN notes
        ELSE 'Missing'
      END,
    display_check_out = 
      CASE 
        WHEN shift_type = 'morning' THEN '14:00'
        WHEN shift_type = 'evening' THEN '22:00'
        WHEN shift_type = 'night' THEN '06:00'
        WHEN shift_type = 'canteen' AND EXTRACT(HOUR FROM timestamp) = 7 THEN '16:00'
        WHEN shift_type = 'canteen' THEN '17:00'
        WHEN shift_type = 'off_day' AND notes = 'OFF-DAY' THEN 'OFF-DAY'
        WHEN shift_type = 'off_day' AND notes != 'OFF-DAY' THEN notes
        ELSE 'Missing'
      END
  WHERE 
    is_manual_entry = TRUE
    AND (display_check_in IS NULL OR display_check_out IS NULL);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % manual entries with NULL display values', updated_count;

  -- Fix check-in records that should show both check-in and check-out
  UPDATE time_records t_in
  SET 
    display_check_in = 
      CASE 
        WHEN t_in.shift_type = 'morning' THEN '05:00'
        WHEN t_in.shift_type = 'evening' THEN '13:00'
        WHEN t_in.shift_type = 'night' THEN '21:00'
        WHEN t_in.shift_type = 'canteen' AND EXTRACT(HOUR FROM t_in.timestamp) = 7 THEN '07:00'
        WHEN t_in.shift_type = 'canteen' THEN '08:00'
        ELSE t_in.display_check_in
      END,
    display_check_out = 
      CASE 
        WHEN t_in.shift_type = 'morning' THEN '14:00'
        WHEN t_in.shift_type = 'evening' THEN '22:00'
        WHEN t_in.shift_type = 'night' THEN '06:00'
        WHEN t_in.shift_type = 'canteen' AND EXTRACT(HOUR FROM t_in.timestamp) = 7 THEN '16:00'
        WHEN t_in.shift_type = 'canteen' THEN '17:00'
        ELSE t_in.display_check_out
      END
  FROM time_records t_out
  WHERE 
    t_in.is_manual_entry = TRUE
    AND t_in.employee_id = t_out.employee_id
    AND t_in.status = 'check_in'
    AND t_out.status = 'check_out'
    AND t_in.working_week_start = t_out.working_week_start
    AND t_in.shift_type = t_out.shift_type
    AND (
      t_in.display_check_in = 'Missing' OR
      t_in.display_check_out = 'Missing'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % manual entry check-in records with display issues', updated_count;
  
  -- Fix check-out records that should show both check-in and check-out
  UPDATE time_records t_out
  SET 
    display_check_in = 
      CASE 
        WHEN t_out.shift_type = 'morning' THEN '05:00'
        WHEN t_out.shift_type = 'evening' THEN '13:00'
        WHEN t_out.shift_type = 'night' THEN '21:00'
        WHEN t_out.shift_type = 'canteen' AND EXTRACT(HOUR FROM t_out.timestamp) = 7 THEN '07:00'
        WHEN t_out.shift_type = 'canteen' THEN '08:00'
        ELSE t_out.display_check_in
      END,
    display_check_out = 
      CASE 
        WHEN t_out.shift_type = 'morning' THEN '14:00'
        WHEN t_out.shift_type = 'evening' THEN '22:00'
        WHEN t_out.shift_type = 'night' THEN '06:00'
        WHEN t_out.shift_type = 'canteen' AND EXTRACT(HOUR FROM t_out.timestamp) = 7 THEN '16:00'
        WHEN t_out.shift_type = 'canteen' THEN '17:00'
        ELSE t_out.display_check_out
      END
  FROM time_records t_in
  WHERE 
    t_out.is_manual_entry = TRUE
    AND t_out.employee_id = t_in.employee_id
    AND t_out.status = 'check_out'
    AND t_in.status = 'check_in'
    AND t_out.working_week_start = t_in.working_week_start
    AND t_out.shift_type = t_in.shift_type
    AND (
      t_out.display_check_in = 'Missing' OR
      t_out.display_check_out = 'Missing'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % manual entry check-out records with display issues', updated_count;
END $$;

-- Create a function to mark records as approved when set
CREATE OR REPLACE FUNCTION mark_approved_records()
RETURNS TRIGGER AS $$
BEGIN
  -- If the record is being marked as approved, set the approved flag
  IF TG_OP = 'UPDATE' AND NEW.approved IS DISTINCT FROM OLD.approved THEN
    RAISE NOTICE 'Record % approval status changed from % to %',
      NEW.id, OLD.approved, NEW.approved;
  END IF;
  
  -- For manual entries, always ensure they have proper display values
  IF NEW.is_manual_entry = TRUE AND NEW.approved = TRUE THEN
    -- If being approved, check that display values are set correctly
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
      -- For canteen shifts, determine if it's 7AM or 8AM based on timestamp
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

-- Create a trigger for mark_approved_records
DROP TRIGGER IF EXISTS trg_mark_approved_records ON time_records;
CREATE TRIGGER trg_mark_approved_records
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION mark_approved_records();