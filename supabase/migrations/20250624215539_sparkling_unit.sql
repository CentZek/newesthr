/*
  # Fix Manual Entry Display Times
  
  1. Changes:
    - Create a trigger function to standardize display times for manual entries
    - Update existing manual entries to display correct times in Face ID Data page
    - Ensure check-in and check-out times are never set to "Missing" for manual entries
    - Fix issue where manual entries directly go to Approved Hours
    
  2. Data Integrity:
    - Standardize display times based on shift type for all manual entries
    - Explicitly set approved = false for all manual entries by default
    - Update existing records that have incorrect display values
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

  -- Fix any manual entries where check-in has check-out display values
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
    AND t_in.shift_type = t_out.shift_type
    AND t_in.working_week_start = t_out.working_week_start
    AND (
      t_in.display_check_in IS NULL OR 
      t_in.display_check_in = 'Missing' OR
      t_in.display_check_out IS NULL OR 
      t_in.display_check_out = 'Missing'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % manual entry check-in records with display value issues', updated_count;
  
  -- Fix any manual entries where check-out has check-in display values
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
    AND t_out.shift_type = t_in.shift_type
    AND t_out.working_week_start = t_in.working_week_start
    AND (
      t_out.display_check_in IS NULL OR 
      t_out.display_check_in = 'Missing' OR
      t_out.display_check_out IS NULL OR 
      t_out.display_check_out = 'Missing'
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % manual entry check-out records with display value issues', updated_count;
END;
$$;