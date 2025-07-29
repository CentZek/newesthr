/*
  # Create approved hours summary RPC function
  
  1. New Functions
    - `get_approved_hours_summary(start_date_filter, end_date_filter)`
      - Returns aggregated approved hours data by employee
      - Accepts optional date range filters
      - Returns employee name, employee number, and total hours
  
  2. Security
    - Function marked as SECURITY DEFINER
    - Granted EXECUTE permissions to anon and authenticated roles
*/

CREATE OR REPLACE FUNCTION public.get_approved_hours_summary(
  start_date_filter DATE DEFAULT NULL,
  end_date_filter DATE DEFAULT NULL
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  employee_number TEXT,
  total_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as employee_id,
    e.name as employee_name,
    e.employee_number as employee_number,
    COALESCE(SUM(tr.exact_hours), 0) as total_hours
  FROM employees e
  LEFT JOIN time_records tr ON e.id = tr.employee_id 
    AND tr.approved = true
    AND (start_date_filter IS NULL OR tr.working_week_start >= start_date_filter)
    AND (end_date_filter IS NULL OR tr.working_week_start <= end_date_filter)
  GROUP BY e.id, e.name, e.employee_number
  HAVING COALESCE(SUM(tr.exact_hours), 0) > 0
  ORDER BY e.name;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_approved_hours_summary(DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.get_approved_hours_summary(DATE, DATE) TO authenticated;