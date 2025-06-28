/*
  # Add approved column to time_records table

  1. Schema Changes
    - Add `approved` column to `time_records` table
      - Type: boolean
      - Default: false
      - Not nullable

  2. Purpose
    - This column tracks whether a time record has been approved by HR
    - Used for manual entries and processing workflow
    - Prevents auto-approval of records that need review

  3. Notes
    - All existing records will default to false (not approved)
    - Manual entries should be set to false by default
    - Only approved records should be included in payroll calculations
*/

-- Add the approved column to time_records table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_records' AND column_name = 'approved'
  ) THEN
    ALTER TABLE time_records ADD COLUMN approved boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Create an index on the approved column for better query performance
CREATE INDEX IF NOT EXISTS idx_time_records_approved ON time_records (approved);

-- Update any existing records that should be considered approved
-- (Records with exact_hours set are typically already processed/approved)
UPDATE time_records 
SET approved = true 
WHERE exact_hours IS NOT NULL 
  AND approved = false;