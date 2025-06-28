/*
  # Add Custom Shift Type to Database Schema
  
  1. Changes
    - Update the time_records_shift_type_check constraint to include 'custom' as a valid shift type
    - This allows the UI to save custom shifts to the database
    
  2. Benefits
    - Enables users to create shifts with custom start/end times
    - Maintains compatibility with existing shift types
    - Preserves data integrity with proper constraints
*/

-- Drop the existing constraint
ALTER TABLE public.time_records 
DROP CONSTRAINT IF EXISTS time_records_shift_type_check;

-- Create the constraint with explicit inclusion of 'custom'
ALTER TABLE public.time_records 
ADD CONSTRAINT time_records_shift_type_check 
CHECK (shift_type = ANY (ARRAY['morning'::text, 'evening'::text, 'night'::text, 'canteen'::text, 'off_day'::text, 'unknown'::text, 'custom'::text, NULL::text]));

-- Add a comment to the shift_type column documenting the allowed values
COMMENT ON COLUMN public.time_records.shift_type IS 'Type of shift: morning, evening, night, canteen, off_day, unknown, custom';

-- Verify the constraint is correctly defined
DO $$
DECLARE
  constraint_exists boolean;
  constraint_definition text;
BEGIN
  -- Check if constraint exists
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'time_records_shift_type_check' 
    AND table_name = 'time_records'
  ) INTO constraint_exists;
  
  IF constraint_exists THEN
    -- Get the constraint definition to verify it includes 'custom'
    SELECT pg_get_constraintdef(oid) INTO constraint_definition
    FROM pg_constraint
    WHERE conname = 'time_records_shift_type_check';
    
    RAISE NOTICE 'Constraint definition: %', constraint_definition;
    
    -- Verify 'custom' is included
    IF constraint_definition NOT LIKE '%''custom''%' THEN
      RAISE EXCEPTION 'The shift_type constraint does not include ''custom''';
    ELSE
      RAISE NOTICE 'Constraint successfully updated to include ''custom''';
    END IF;
  ELSE
    RAISE EXCEPTION 'Failed to create the shift_type constraint';
  END IF;
END $$;

-- Test inserting a record with 'custom' shift type
DO $$
BEGIN
  -- Insert a test record with custom shift type
  BEGIN
    INSERT INTO public.time_records (
      employee_id,
      timestamp,
      status,
      shift_type,
      notes
    )
    SELECT 
      id,
      NOW(),
      'check_in',
      'custom',
      'Test record for custom shift - will be deleted'
    FROM public.employees
    LIMIT 1;
    
    -- If we got here, the insert was successful
    RAISE NOTICE 'Successfully inserted a test record with custom shift type';
    
    -- Clean up the test record
    DELETE FROM public.time_records
    WHERE notes = 'Test record for custom shift - will be deleted';
    
  EXCEPTION WHEN others THEN
    -- Failed to insert
    RAISE NOTICE 'Failed to insert a record with custom shift type: %', SQLERRM;
  END;
END $$;