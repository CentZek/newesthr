/*
  # Synchronize Leave Deletions between Approved Hours and Employee Calendar
  
  1. Changes:
     - Add trigger to detect when leave records are deleted from time_records
     - Automatically update corresponding leave_requests status when all related records are deleted
     - Add indexes to improve performance of leave-related queries
     
  2. Benefits:
     - Maintains consistency between HR view (Approved Hours) and Employee view
     - Automatically removes leave tags from Employee calendar when HR deletes records
     - Prevents orphaned leave requests that no longer have corresponding time records
*/

-- Create a function to update leave_requests when time_records are deleted
CREATE OR REPLACE FUNCTION sync_leave_deletion()
RETURNS TRIGGER AS $$
DECLARE
  leave_type_name TEXT;
  leave_request_id UUID;
  remaining_records INTEGER;
BEGIN
  -- Only proceed if this is a leave-related record
  IF OLD.status = 'off_day' AND OLD.notes IS NOT NULL AND OLD.notes != 'OFF-DAY' THEN
    -- Extract leave type from notes
    leave_type_name := OLD.notes;
    
    -- Check if there's a corresponding leave request
    SELECT id INTO leave_request_id
    FROM leave_requests
    WHERE employee_id = OLD.employee_id
      AND leave_type = leave_type_name
      AND status = 'approved'
      -- The time record date must fall between start_date and end_date
      AND (OLD.timestamp::date BETWEEN start_date AND end_date);
      
    -- If we found a matching leave request
    IF leave_request_id IS NOT NULL THEN
      -- Count how many time records still exist for this leave request
      SELECT COUNT(*) INTO remaining_records
      FROM time_records
      WHERE employee_id = OLD.employee_id
        AND status = 'off_day'
        AND notes = leave_type_name
        -- The date must fall between the leave request dates
        AND EXISTS (
          SELECT 1 FROM leave_requests
          WHERE id = leave_request_id
            AND (time_records.timestamp::date BETWEEN start_date AND end_date)
        );
      
      -- If no records remain, update the leave request status
      IF remaining_records = 0 THEN
        UPDATE leave_requests
        SET status = 'cancelled'
        WHERE id = leave_request_id;
        
        RAISE NOTICE 'Updated leave request % to cancelled status', leave_request_id;
      ELSE
        RAISE NOTICE 'Leave request % still has % time records', leave_request_id, remaining_records;
      END IF;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to run the function after DELETE operations on time_records
DROP TRIGGER IF EXISTS trg_sync_leave_deletion ON time_records;
CREATE TRIGGER trg_sync_leave_deletion
  AFTER DELETE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION sync_leave_deletion();

-- Add index on leave_requests for employee_id and status for better performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id_status
ON leave_requests(employee_id, status);

-- Add index on notes column for time_records to speed up leave type matching
CREATE INDEX IF NOT EXISTS time_records_notes_idx
ON time_records(notes)
WITH (deduplicate_items = true)
WHERE status = 'off_day';

-- Add comment explaining the purpose of the trigger
COMMENT ON FUNCTION sync_leave_deletion() IS 'Maintains sync between time_records and leave_requests when leave records are deleted by HR';