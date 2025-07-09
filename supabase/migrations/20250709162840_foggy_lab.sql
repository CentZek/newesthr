/*
  # Add Unpaid Leave Type
  
  1. Changes:
    - Create a function to handle unpaid leave differently from other leave types
    - Modify the update_leave_days() trigger function to set hours to 0 for unpaid leave
    - Ensure unpaid leave records are properly identified in the system
    
  2. Data Integrity:
    - Preserves the same workflow as other leave types
    - Sets exact_hours to 0 for unpaid leave (similar to OFF-DAYs)
    - Maintains all other leave day functionality
*/

-- Create or replace function to update leave days with special handling for unpaid leave
CREATE OR REPLACE FUNCTION update_leave_days()
RETURNS TRIGGER AS $$
DECLARE
  curr_date date;
  hours_value numeric(10,2);
BEGIN
  -- Only proceed if status changed to 'approved'
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Set hours based on leave type (0 for unpaid leave, 9 for all others)
    hours_value := CASE WHEN NEW.leave_type = 'unpaid-leave' THEN 0.0 ELSE 9.0 END;
    
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
        approved = TRUE,
        exact_hours = hours_value -- Use the calculated hours value
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
          approved,
          exact_hours
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
          TRUE,
          hours_value -- Use the calculated hours value
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