/*
  # Fix Approved Leave Requests Not Appearing in Approved Hours
  
  1. Changes:
    - Update the update_leave_days() trigger function to set the 'approved' field to TRUE for leave records
    - Add exact_hours field to leave records for proper pay calculation
    - Fix display values for leave records to ensure they appear correctly in the Approved Hours view
    
  2. Problem Solved:
    - Approved leave requests will now properly show in the Approved Hours view
    - Fixes the disconnect between leave approval and approved hours
*/

-- Update the trigger function to mark leave records as approved
CREATE OR REPLACE FUNCTION update_leave_days()
RETURNS TRIGGER AS $$
DECLARE
  curr_date date;
BEGIN
  -- Only proceed if status changed to 'approved'
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Loop through each day in the leave period
    curr_date := NEW.start_date;
    WHILE curr_date <= NEW.end_date LOOP
      -- Check if there's an existing OFF-DAY record
      UPDATE public.time_records
      SET 
        notes = CASE 
          WHEN notes = 'OFF-DAY' THEN NEW.leave_type
          ELSE notes || '; ' || NEW.leave_type
        END,
        approved = TRUE, -- Mark as approved
        exact_hours = 9.0 -- Standard 9 hours for leave days
      WHERE 
        employee_id = NEW.employee_id
        AND status = 'off_day'
        AND timestamp::date = curr_date;
        
      -- If no OFF-DAY record exists, create one
      IF NOT FOUND THEN
        INSERT INTO public.time_records (
          employee_id, 
          timestamp, 
          status, 
          shift_type, 
          notes,
          working_week_start,
          display_check_in,
          display_check_out,
          approved, -- Include approved field
          exact_hours -- Include exact_hours for proper pay calculation
        )
        VALUES (
          NEW.employee_id, 
          curr_date + INTERVAL '12 hours', 
          'off_day', 
          'off_day', 
          NEW.leave_type,
          curr_date,
          NEW.leave_type,
          NEW.leave_type,
          TRUE, -- Set to approved
          9.0  -- Standard 9 hours for leave days
        );
      END IF;
      
      -- Move to next day
      curr_date := curr_date + INTERVAL '1 day';
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS trg_update_leave_days ON public.leave_requests;
CREATE TRIGGER trg_update_leave_days
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_days();