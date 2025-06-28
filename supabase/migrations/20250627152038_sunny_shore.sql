/*
  # Add Custom Shift Type to Database Schema
  
  1. Changes
    - Update the time_records_shift_type_check constraint to include 'custom' as a valid shift type
    - Update the employee_shifts_shift_type_check constraint to include 'custom' as a valid shift type
    - Create function to preserve custom times for manual entries
    
  2. Benefits
    - Enables HR to create shifts with custom start/end times
    - Ensures custom times are preserved and displayed correctly
    - Maintains data integrity with proper constraints
*/

-- Fix constraint on time_records table
ALTER TABLE public.time_records 
DROP CONSTRAINT IF EXISTS time_records_shift_type_check;

ALTER TABLE public.time_records 
ADD CONSTRAINT time_records_shift_type_check 
CHECK (shift_type = ANY (ARRAY['morning'::text, 'evening'::text, 'night'::text, 'canteen'::text, 'off_day'::text, 'unknown'::text, 'custom'::text, NULL::text]));

-- Fix constraint on employee_shifts table
ALTER TABLE public.employee_shifts 
DROP CONSTRAINT IF EXISTS employee_shifts_shift_type_check;

ALTER TABLE public.employee_shifts 
ADD CONSTRAINT employee_shifts_shift_type_check 
CHECK (shift_type = ANY (ARRAY['morning'::text, 'evening'::text, 'night'::text, 'custom'::text]));

-- Update column comments
COMMENT ON COLUMN public.time_records.shift_type IS 'Type of shift: morning, evening, night, canteen, off_day, unknown, custom';
COMMENT ON COLUMN public.employee_shifts.shift_type IS 'Type of shift: morning, evening, night, custom';

-- Create function to preserve display times for custom shifts
CREATE OR REPLACE FUNCTION fix_manual_entry_display()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle manual entries
  IF NEW.is_manual_entry = TRUE THEN
    -- For custom shifts, ensure display times match input times
    IF NEW.shift_type = 'custom' AND NEW.notes LIKE '%customTimes:%' THEN
      -- Try to extract custom times from notes
      DECLARE
        custom_times_match text;
        custom_times text;
        custom_start_time text;
        custom_end_time text;
      BEGIN
        -- Extract custom times pattern
        SELECT substring(NEW.notes FROM 'customTimes:([^;]+)') INTO custom_times_match;
        
        IF custom_times_match IS NOT NULL THEN
          -- Split into start and end times
          SELECT split_part(custom_times_match, '-', 1) INTO custom_start_time;
          SELECT split_part(custom_times_match, '-', 2) INTO custom_end_time;
          
          -- Update display values with the custom times
          NEW.display_check_in := custom_start_time;
          NEW.display_check_out := custom_end_time;
        END IF;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to apply function to time records
DROP TRIGGER IF EXISTS trg_fix_manual_entry_display ON time_records;
CREATE TRIGGER trg_fix_manual_entry_display
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION fix_manual_entry_display();

-- Fix existing custom shift records
DO $$
DECLARE
  custom_records RECORD;
  custom_times_match text;
  custom_start_time text;
  custom_end_time text;
  updated_count integer := 0;
BEGIN
  FOR custom_records IN
    SELECT id, notes
    FROM time_records
    WHERE notes LIKE '%customTimes:%'
  LOOP
    -- Extract custom times
    SELECT substring(custom_records.notes FROM 'customTimes:([^;]+)') INTO custom_times_match;
    
    IF custom_times_match IS NOT NULL THEN
      -- Split into start and end times
      SELECT split_part(custom_times_match, '-', 1) INTO custom_start_time;
      SELECT split_part(custom_times_match, '-', 2) INTO custom_end_time;
      
      -- Update record with custom times
      UPDATE time_records
      SET 
        display_check_in = custom_start_time,
        display_check_out = custom_end_time,
        shift_type = 'custom'  -- Update to custom shift type
      WHERE id = custom_records.id;
      
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Updated % custom shift records', updated_count;
END $$;