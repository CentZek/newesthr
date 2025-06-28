/*
  # Fix Manual Entry Display Times
  
  1. Changes:
    - Create a trigger function to ensure all manual entries use consistent display times
    - Update existing manual entries to have correct display times based on shift type
    - Add an automatic trigger to fix newly inserted records
    
  2. Data Integrity:
    - Ensures all manual entries have proper display values in Face ID Data view
    - Prevents records from being auto-approved
    - Fixes all existing data with incorrect display values
*/

-- Create function to standardize display times for manual entries
CREATE OR REPLACE FUNCTION standardize_manual_entry_display_times()
RETURNS TRIGGER AS $$
BEGIN
  -- Set standard display times based on shift type for manual entries
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
    END IF;

    -- Always set manual entries to not approved by default
    NEW.approved := FALSE;
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
END;
$$;