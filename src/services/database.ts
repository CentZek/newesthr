import { supabase } from '../lib/supabase';
import { format, isFriday, parseISO, isValid } from 'date-fns';
import { EmployeeRecord, DailyRecord } from '../types';
import toast from 'react-hot-toast';
import { parseShiftTimes } from '../utils/dateTimeHelper';
import { isDoubleTimeDay, getDoubleTimeDays, backupCurrentHolidays, refreshDoubleTimeDaysCache } from '../services/holidayService';

// Helper function to create a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cache for employee IDs to reduce database lookups
const employeeIdCache = new Map<string, string>();

// Fetch approved hours summary
export const fetchApprovedHours = async (dateFilter: string = ''): Promise<{
  data: any[];
  totalHoursSum: number;
}> => {
  try {
    // First, select only check-in records (to avoid double-counting hours)
    let query = supabase
      .from('time_records')
      .select(`
        employee_id,
        timestamp,
        status,
        exact_hours,
        working_week_start,
        employees (
          id,
          name,
          employee_number
        )
      `)
      .in('status', ['check_in', 'off_day'])  // Include both check-in and off-day records
      .not('exact_hours', 'is', null);
    
    // Apply date filter if provided
    if (dateFilter) {
      if (dateFilter.includes('|')) {
        // Custom date range: startDate|endDate
        const [startDate, endDate] = dateFilter.split('|');
        
        if (startDate && endDate && isValid(parseISO(startDate)) && isValid(parseISO(endDate))) {
          // Fix: Use working_week_start for consistent filtering
          query = query
            .gte('working_week_start', startDate)
            .lte('working_week_start', endDate);
        }
      } else {
        // Month filter: YYYY-MM
        try {
          const [year, month] = dateFilter.split('-');
          if (year && month) {
            const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            if (isValid(monthDate)) {
              const startDate = startOfMonth(monthDate);
              const endDate = endOfMonth(monthDate);
              
              const startStr = format(startDate, 'yyyy-MM-dd');
              const endStr = format(endDate, 'yyyy-MM-dd');
              
              // Fix: Use working_week_start for consistent filtering
              query = query
                .gte('working_week_start', startStr)
                .lte('working_week_start', endStr);
            }
          }
        } catch (error) {
          console.error('Error parsing month filter:', error);
        }
      }
    }
    
    // IMPORTANT: Only include approved records
    query = query.eq('approved', true);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Group by employee and calculate totals
    const employeeSummary = new Map();
    let totalHoursSum = 0;
    
    data?.forEach(record => {
      if (!record.employees) return;
      
      const employeeId = record.employee_id;
      const hours = parseFloat(record.exact_hours || 0);
      const isOffDay = record.status === 'off_day';
      const isLeaveDay = isOffDay && record.notes && record.notes !== 'OFF-DAY';
      
      if (isNaN(hours)) return;
      
      // If this is a leave day, assign 9 hours instead of 0
      const adjustedHours = isLeaveDay ? 9.0 : hours;
      
      // Only add hours if this isn't a regular OFF-DAY
      // For leave types, we now add 9 hours
      const hoursToAdd = isOffDay && !isLeaveDay ? 0 : adjustedHours;
      
      totalHoursSum += hoursToAdd;
      
      if (!employeeSummary.has(employeeId)) {
        employeeSummary.set(employeeId, {
          id: employeeId,
          name: record.employees.name,
          employee_number: record.employees.employee_number,
          total_days: new Set(),
          total_hours: 0,
          working_week_dates: new Set(), // Track all working week dates for double-time calculations
          hours_by_date: {}, // Track hours by date for double-time calculations
          off_days: new Set(), // Track OFF-DAY dates
        });
      }
      
      const employee = employeeSummary.get(employeeId);
      
      // Add date to total_days set
      if (record.working_week_start) {
        employee.total_days.add(record.working_week_start);
        employee.working_week_dates.add(record.working_week_start);
        
        // If it's a leave day, add 9 hours to the employee's total
        if (isLeaveDay) {
          // Add hours to total
          // For unpaid leave, add 0 hours; for other leaves add 9 hours
          employee.total_hours += record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          
          // Track hours by date (9.0 hours for leave days)
          if (!employee.hours_by_date[record.working_week_start]) {
            employee.hours_by_date[record.working_week_start] = record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          }
        }
        
        // If it's an OFF-DAY, add to off_days set
        if (isOffDay) {
          employee.off_days.add(record.working_week_start);
        } 
        // For regular hours (non-OFF-DAY records)
        else if (hours > 0) {
          employee.total_hours += hours;
          
          // Track hours by date
          if (!employee.hours_by_date[record.working_week_start]) {
            employee.hours_by_date[record.working_week_start] = hours;
          } else {
            // If we already have hours for this date, add to them
            // (could happen with multiple records for same day/shift)
            employee.hours_by_date[record.working_week_start] += hours;
          }
        }
      } else if (record.timestamp && isValid(new Date(record.timestamp))) {
        // Use the UTC date portion so nothing shifts under local timezones
        const utc = parseISO(record.timestamp);
        const date = utc.toISOString().slice(0,10); // "YYYY-MM-DD"
        employee.total_days.add(date);
        employee.working_week_dates.add(date);
        
        // If it's a leave day, add 9 hours to the employee's total
        if (isLeaveDay) {
          // Add hours to total
          // For unpaid leave, add 0 hours; for other leaves add 9 hours
          employee.total_hours += record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          
          // Track hours by date (9.0 hours for leave days)
          if (!employee.hours_by_date[date]) {
            employee.hours_by_date[date] = record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          }
        }
        
        // If it's an OFF-DAY, add to off_days set
        if (isOffDay) {
          employee.off_days.add(date);
        } 
        // For regular hours (non-OFF-DAY records)
        else if (hours > 0) {
          employee.total_hours += hours;
          
          // Track hours by date
          if (!employee.hours_by_date[date]) {
            employee.hours_by_date[date] = hours;
          } else {
            // If we already have hours for this date, add to them
            employee.hours_by_date[date] += hours;
          }
        }
      }
    });
    
    // Apply additional filter to include only approved records for Off-DAY
    let offDayQuery = supabase
      .from('time_records')
      .select(`
        employee_id,
        timestamp,
        status,
        working_week_start,
        notes,
        employees (
          id,
          name,
          employee_number
        )
      `)
      .eq('status', 'off_day')
      .eq('approved', true);  // Only approved off-day records
    
    // Apply the same date filter to off-day records
    if (dateFilter) {
      if (dateFilter.includes('|')) {
        // Custom date range: startDate|endDate
        const [startDate, endDate] = dateFilter.split('|');
        
        if (startDate && endDate && isValid(parseISO(startDate)) && isValid(parseISO(endDate))) {
          // Fix: Use working_week_start for consistent filtering
          offDayQuery = offDayQuery
            .gte('working_week_start', startDate)
            .lte('working_week_start', endDate);
        }
      } else {
        // Month filter: YYYY-MM
        try {
          const [year, month] = dateFilter.split('-');
          if (year && month) {
            const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            if (isValid(monthDate)) {
              const startDate = startOfMonth(monthDate);
              const endDate = endOfMonth(monthDate);
              
              // Fix: Use working_week_start for consistent filtering
              offDayQuery = offDayQuery
                .gte('working_week_start', format(startDate, 'yyyy-MM-dd'))
                .lte('working_week_start', format(endDate, 'yyyy-MM-dd'));
            }
          }
        } catch (err) {
          console.error('Error parsing month filter for off days:', err);
        }
      }
    }
    
    const { data: offDayData, error: offDayError } = await offDayQuery;
    
    if (offDayError) throw offDayError;
    
    // Add OFF-DAY records to the employee totals
    offDayData?.forEach(record => {
      if (!record.employees) return;
      
      const employeeId = record.employee_id;
      
      if (!employeeSummary.has(employeeId)) {
        employeeSummary.set(employeeId, {
          id: employeeId,
          name: record.employees.name,
          employee_number: record.employees.employee_number,
          total_days: new Set(),
          total_hours: 0,
          working_week_dates: new Set(),
          hours_by_date: {},
          off_days: new Set()
        });
      }
      
      const employee = employeeSummary.get(employeeId);
      
      // Check if this is a leave day (not a regular OFF-DAY)
      const isLeaveDay = record.notes && record.notes !== 'OFF-DAY';
      
      // Add date to total_days set
      if (record.working_week_start) {
        employee.total_days.add(record.working_week_start);
        employee.working_week_dates.add(record.working_week_start);
        
        // If it's a leave day, add 9 hours to the employee's total
        if (isLeaveDay) {
          // Add hours to total
          // For unpaid leave, add 0 hours; for other leaves add 9 hours
          employee.total_hours += record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          
          // Track hours by date (9.0 hours for leave days)
          if (!employee.hours_by_date[record.working_week_start]) {
            employee.hours_by_date[record.working_week_start] = record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          }
        }
        
        // If it's an OFF-DAY, add to off_days set
        if (!isLeaveDay) {
          employee.off_days.add(record.working_week_start);
        }
      } else if (record.timestamp && isValid(new Date(record.timestamp))) {
        // Use the UTC date portion so nothing shifts under local timezones
        const utc = parseISO(record.timestamp);
        const date = utc.toISOString().slice(0,10); // "YYYY-MM-DD"
        employee.total_days.add(date);
        employee.working_week_dates.add(date);
        
        // If it's a leave day, add 9 hours to the employee's total
        if (isLeaveDay) {
          // Add hours to total
          // For unpaid leave, add 0 hours; for other leaves add 9 hours
          employee.total_hours += record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          
          // Track hours by date (9.0 hours for leave days)
          if (!employee.hours_by_date[date]) {
            employee.hours_by_date[date] = record.notes === 'unpaid-leave' ? 0.0 : 9.0;
          }
        }
        
        // If it's an OFF-DAY, add to off_days set
        if (!isLeaveDay) {
          employee.off_days.add(date);
        }
      }
    });
    
    // Calculate double-time hours for each employee
    let startDate, endDate;
    
    if (dateFilter) {
      if (dateFilter.includes('|')) {
        // Custom date range
        [startDate, endDate] = dateFilter.split('|');
      } else {
        // Month filter
        try {
          const [year, month] = dateFilter.split('-');
          if (year && month) {
            const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            if (isValid(monthDate)) {
              startDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
              endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
            } else {
              // Default to recent month if dates are invalid
              startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
              endDate = format(new Date(), 'yyyy-MM-dd');
            }
          }
        } catch (err) {
          console.error('Error parsing month filter:', err);
          startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
          endDate = format(new Date(), 'yyyy-MM-dd');
        }
      }
    } else {
      // Default to last 365 days
      startDate = format(subDays(new Date(), 365), 'yyyy-MM-dd');
      endDate = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    }
    
    // Refresh the double-time days cache to ensure fresh data
    refreshDoubleTimeDaysCache();
    
    // Get all double-time days in the date range
    const doubleDays = await getDoubleTimeDays(startDate, endDate);
    
    // Convert to array and calculate days and double-time hours
    const result = Array.from(employeeSummary.values()).map(emp => {
      // Calculate double-time hours
      let doubleTimeHours = 0;
      let regularHours = 0;
      const workingDates = Array.from(emp.working_week_dates);
      
      workingDates.forEach(dateStr => {
        const hours = emp.hours_by_date?.[dateStr] || 0;
        // Check both the doubleDays array AND if it's a Friday
        const isDoubletime = doubleDays.includes(dateStr) || isFriday(parseISO(dateStr));
        
        if (isDoubletime) {
          doubleTimeHours += hours; // This is the bonus hours
        }
        regularHours += hours; // Always add to regular hours
      });
      
      // Get the count of off days
      const offDaysCount = emp.off_days ? emp.off_days.size : 0;
      
      // Calculate working days (total_days - off_days)
      const workingDays = emp.total_days.size - offDaysCount;
      
      return {
        ...emp,
        total_days: emp.total_days.size,
        working_days: workingDays,
        off_days_count: offDaysCount,
        total_hours: parseFloat(regularHours.toFixed(2)),
        double_time_hours: parseFloat(doubleTimeHours.toFixed(2)),
        working_week_dates: Array.from(emp.working_week_dates)
      };
    });
    
    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));
    
    return { 
      data: result, 
      totalHoursSum: parseFloat(totalHoursSum.toFixed(2))
    };
  } catch (error) {
    console.error('Error fetching approved hours:', error);
    throw error;
  }
};

// Fetch employee details for approved hours
export const fetchEmployeeDetails = async (employeeId: string, dateFilter: string = ''): Promise<{
  data: any[];
}> => {
  try {
    let query = supabase
      .from('time_records')
      .select(`
        id,
        employee_id,
        timestamp,
        status,
        shift_type,
        is_late,
        early_leave,
        deduction_minutes,
        notes,
        exact_hours,
        display_time,
        display_check_in,
        display_check_out,
        mislabeled,
        working_week_start,
        is_manual_entry,
        approved,
        employees (
          name,
          employee_number
        )
      `)
      .eq('employee_id', employeeId)
      .eq('approved', true)  // Only include approved records
      .order('timestamp', { ascending: true });
    
    // Apply date filter if provided
    if (dateFilter) {
      if (dateFilter.includes('|')) {
        // Custom date range: startDate|endDate
        const [startDate, endDate] = dateFilter.split('|');
        
        if (startDate && endDate && isValid(parseISO(startDate)) && isValid(parseISO(endDate))) {
          // Fix: Use working_week_start for consistent filtering
          query = query
            .gte('working_week_start', startDate)
            .lte('working_week_start', endDate);
        }
      } else {
        // Month filter: YYYY-MM
        try {
          const [year, month] = dateFilter.split('-');
          if (year && month) {
            const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            if (isValid(monthDate)) {
              const startDate = startOfMonth(monthDate);
              const endDate = endOfMonth(monthDate);
              
              // Fix: Use working_week_start for consistent filtering
              query = query
                .gte('working_week_start', format(startDate, 'yyyy-MM-dd'))
                .lte('working_week_start', format(endDate, 'yyyy-MM-dd'));
            }
          }
        } catch (error) {
          console.error('Error parsing month filter:', error);
        }
      }
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return { data: data || [] };
  } catch (error) {
    console.error('Error fetching employee details:', error);
    throw error;
  }
};

// Check if a time record exists before inserting
export const checkExistingTimeRecord = async (
  employeeId: string, 
  shiftType: string, 
  status: string, 
  workingWeekStart: string
): Promise<string | null> => {
  try {
    // Log the search parameters for debugging
    console.log('Checking for existing record with:', {
      employeeId,
      shiftType,
      status,
      workingWeekStart,
      is_manual_entry: true
    });

    const { data, error } = await supabase
      .from('time_records')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('status', status) // IMPORTANT: Filter by status to prevent mix-ups
      .eq('working_week_start', workingWeekStart)
      .eq('is_manual_entry', true)
      .maybeSingle();

    if (error) throw error;
    
    if (data) {
      console.log('Found existing record with ID:', data.id);
    } else {
      console.log('No existing record found');
    }
    
    return data ? data.id : null;
  } catch (error) {
    console.error('Error checking existing time record:', error);
    return null;
  }
};

// Safely insert or update time record
export const safeUpsertTimeRecord = async (recordData: any, existingId: string | null = null): Promise<boolean> => {
  try {
    // CRITICAL FIX: Always set standard display times for manual entries
    if (recordData.is_manual_entry === true) {
      // Standard display times by shift type
      if (recordData.shift_type === 'morning') {
        recordData.display_check_in = '05:00';
        recordData.display_check_out = '14:00';
      } else if (recordData.shift_type === 'evening') {
        recordData.display_check_in = '13:00';
        recordData.display_check_out = '22:00';
      } else if (recordData.shift_type === 'night') {
        recordData.display_check_in = '21:00';
        recordData.display_check_out = '06:00';
      } else if (recordData.shift_type === 'canteen') {
        // Check if this is 7AM or 8AM canteen shift
        const hour = recordData.timestamp ? new Date(recordData.timestamp).getHours() : 7;
        if (hour === 7) {
          recordData.display_check_in = '07:00';
          recordData.display_check_out = '16:00';
        } else {
          recordData.display_check_in = '08:00';
          recordData.display_check_out = '17:00';
        }
      } else if (recordData.shift_type === 'off_day' && recordData.status === 'off_day') {
        // For OFF-DAY or leave types
        if (recordData.notes === 'OFF-DAY') {
          recordData.display_check_in = 'OFF-DAY';
          recordData.display_check_out = 'OFF-DAY';
        } else if (recordData.notes && recordData.notes.includes('leave')) {
          // For leave types, use the leave type as display
          recordData.display_check_in = recordData.notes;
          recordData.display_check_out = recordData.notes;
        }
      }
    }

    // If we have an existing ID, update the record
    if (existingId) {
      console.log('Updating existing record with ID:', existingId);
      const { error } = await supabase
        .from('time_records')
        .update(recordData)
        .eq('id', existingId);
        
      if (error) throw error;
      return true;
    } 
    
    // Otherwise try to insert, but be prepared to handle conflict
    try {
      console.log('Attempting to insert new record');
      const { error } = await supabase
        .from('time_records')
        .insert([recordData]);
        
      if (error) {
        // If we get a conflict error (409), try to find the record again and update it
        if (error.code === '23505' || (error.message && error.message.includes('duplicate key value'))) {
          console.log('Duplicate key detected, attempting to find and update record');
          
          // Try to find the record based on the unique constraint
          const existingRecord = await checkExistingTimeRecord(
            recordData.employee_id,
            recordData.shift_type,
            recordData.status,
            recordData.working_week_start
          );
          
          if (existingRecord) {
            console.log('Found conflicting record, updating instead:', existingRecord);
            const { error: updateError } = await supabase
              .from('time_records')
              .update(recordData)
              .eq('id', existingRecord);
              
            if (updateError) throw updateError;
            return true;
          } else {
            throw new Error('Could not find conflicting record for update');
          }
        } else {
          throw error;
        }
      }
      return true;
    } catch (insertError) {
      console.error('Error during insert/update operation:', insertError);
      throw insertError;
    }
  } catch (error) {
    console.error('Error in safeUpsertTimeRecord:', error);
    return false;
  }
};

// Fetch manual time records
export const fetchManualTimeRecords = async (limit: number = 50): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('time_records')
      .select(`
        id,
        employee_id,
        timestamp,
        status,
        shift_type,
        is_late,
        early_leave,
        deduction_minutes,
        notes,
        is_manual_entry,
        display_check_in,
        display_check_out,
        exact_hours,
        working_week_start,
        approved,
        employees (
          name,
          employee_number
        )
      `)
      .eq('is_manual_entry', true)
      .not('status', 'eq', 'off_day')  // Exclude off-day records
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    // Process data to ensure all records have proper display values
    const processedData = data?.map(record => {
      // Make sure all records have properly set display values
      let updatedRecord = { ...record };
      
      // Set standard display times based on shift type if missing or incorrect
      if (record.shift_type) {
        const shiftType = record.shift_type;
        
        // For manual entries, always use standard display times based on shift type
        if (record.is_manual_entry) {
          if (shiftType === 'morning') {
            updatedRecord.display_check_in = '05:00';
            updatedRecord.display_check_out = '14:00';
          } else if (shiftType === 'evening') {
            updatedRecord.display_check_in = '13:00';
            updatedRecord.display_check_out = '22:00';
          } else if (shiftType === 'night') {
            updatedRecord.display_check_in = '21:00';
            updatedRecord.display_check_out = '06:00';
          } else if (shiftType === 'canteen') {
            // Determine if it's a 7AM or 8AM canteen shift
            const hour = record.timestamp ? new Date(record.timestamp).getHours() : 7;
            if (hour === 7) {
              updatedRecord.display_check_in = '07:00';
              updatedRecord.display_check_out = '16:00';
            } else {
              updatedRecord.display_check_in = '08:00';
              updatedRecord.display_check_out = '17:00';
            }
          }
        }
      }
      
      return updatedRecord;
    }) || [];
    
    // Update the database with the correct display values (this is important to fix existing records)
    processedData.forEach(async (record) => {
      if ((record.display_check_in === 'Missing' || record.display_check_out === 'Missing' || 
           record.display_check_in === null || record.display_check_out === null) &&
          record.shift_type && record.is_manual_entry) {
        
        let displayCheckIn = '';
        let displayCheckOut = '';
        
        if (record.shift_type === 'morning') {
          displayCheckIn = '05:00';
          displayCheckOut = '14:00';
        } else if (record.shift_type === 'evening') {
          displayCheckIn = '13:00';
          displayCheckOut = '22:00';
        } else if (record.shift_type === 'night') {
          displayCheckIn = '21:00';
          displayCheckOut = '06:00';
        } else if (record.shift_type === 'canteen') {
          const hour = record.timestamp ? new Date(record.timestamp).getHours() : 7;
          if (hour === 7) {
            displayCheckIn = '07:00';
            displayCheckOut = '16:00';
          } else {
            displayCheckIn = '08:00';
            displayCheckOut = '17:00';
          }
        }
        
        // Update the record in the database
        await supabase
          .from('time_records')
          .update({
            display_check_in: displayCheckIn,
            display_check_out: displayCheckOut,
            approved: false // Ensure it's not automatically approved
          })
          .eq('id', record.id);
      }
    });
    
    return processedData;
  } catch (error) {
    console.error('Error fetching manual time records:', error);
    return [];
  }
};

// Fetch pending employee shifts
export const fetchPendingEmployeeShifts = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('employee_shifts')
      .select(`
        id,
        employee_id,
        date,
        shift_type,
        start_time,
        end_time,
        status,
        notes,
        working_week_start,
        employees (
          name,
          employee_number
        )
      `)
      .eq('status', 'pending')
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error fetching pending employee shifts:', error);
    return [];
  }
};

// Delete all time records
export const deleteAllTimeRecords = async (dateFilter: string = '', employeeFilter: string = '', preserveApproved: boolean = true): Promise<{
  success: boolean;
  message: string;
  count: number;
}> => {
  try {
    // Clear employee ID cache at the start
    clearEmployeeIdCache();
    
    // Build the query for selecting records to delete
    let query = supabase.from('time_records').select('id');
    
    // Apply date filter if provided
    if (dateFilter) {
      if (dateFilter.includes('|')) {
        // Custom date range: startDate|endDate
        const [startDate, endDate] = dateFilter.split('|');
        
        if (startDate && endDate && isValid(parseISO(startDate)) && isValid(parseISO(endDate))) {
          query = query
            .gte('working_week_start', startDate)
            .lte('working_week_start', endDate);
        } else {
          throw new Error('Invalid date range specified');
        }
      } else {
        // Month filter: YYYY-MM
        try {
          const [year, month] = dateFilter.split('-');
          if (year && month) {
            const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            if (isValid(monthDate)) {
              const startDate = startOfMonth(monthDate);
              const endDate = endOfMonth(monthDate);
              
              query = query
                .gte('working_week_start', format(startDate, 'yyyy-MM-dd'))
                .lte('working_week_start', format(endDate, 'yyyy-MM-dd'));
            }
          }
        } catch (err) {
          console.error('Error parsing month filter:', err);
          throw new Error('Invalid month format');
        }
      }
    }
    
    // Apply employee filter if provided
    if (employeeFilter) {
      if (employeeFilter.includes(',')) {
        // Multiple employees
        const employeeIds = employeeFilter.split(',');
        query = query.in('employee_id', employeeIds);
      } else {
        // Single employee
        query = query.eq('employee_id', employeeFilter);
      }
    }
    
    // IMPORTANT: If preserveApproved is true, exclude approved records from deletion
    if (preserveApproved) {
      query = query.eq('approved', false);
    }
    
    // Get all record IDs that match our filters
    const { data: recordsToDelete, error: recordsError } = await query;
    
    if (recordsError) throw recordsError;
    
    if (!recordsToDelete || recordsToDelete.length === 0) {
      return {
        success: true,
        message: 'No records found matching the criteria',
        count: 0
      };
    }
    
    // Process deletions in chunks to avoid URL length limitations
    const chunkSize = 50; // Smaller chunk size to avoid URL length issues
    let deletedCount = 0;
    
    // Extract just the IDs for the delete operation
    const recordIds = recordsToDelete.map(record => record.id);
    
    for (let i = 0; i < recordIds.length; i += chunkSize) {
      const chunk = recordIds.slice(i, i + chunkSize);
      
      // Delete the chunk of records
      const { error: deleteError } = await supabase
        .from('time_records')
        .delete()
        .in('id', chunk);
      
      if (deleteError) {
        console.error(`Error deleting chunk ${i/chunkSize + 1}:`, deleteError);
        throw deleteError;
      }
      
      deletedCount += chunk.length;
      
      // Add a small delay between chunks to reduce server load
      if (i + chunkSize < recordIds.length) {
        await delay(300); // Small delay to prevent overloading the server
      }
    }
    
    return {
      success: true,
      message: `Deleted ${deletedCount} records${preserveApproved ? ' while preserving approved records' : ''}`,
      count: deletedCount
    };
  } catch (error) {
    console.error('Error deleting time records:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      count: 0
    };
  }
};

// Reset all database data
export const resetAllDatabaseData = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  try {
    // Clear employee ID cache at the start
    clearEmployeeIdCache();
    
    // First backup all holidays to ensure they can be restored
    await backupCurrentHolidays();
    
    // Delete time_records but preserve approved records
    // CRITICAL FIX: Added a filter to exclude approved records and manual entries from being deleted during reset
    const { success: timeRecordsDeleted, count: timeRecordsCount, message: timeRecordsMessage } = 
      await deleteAllTimeRecords('', '', true);
    
    if (!timeRecordsDeleted) {
      return {
        success: false,
        message: `Failed to delete time records: ${timeRecordsMessage}`
      };
    }
    
    // Wait for deletion to complete
    await delay(1000);
    
    // Delete processed_excel_files (this will cascade to processed_employee_data and processed_daily_records)
    const { error: filesError } = await supabase
      .from('processed_excel_files')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (filesError) {
      console.error('Error deleting processed_excel_files:', filesError);
      // Continue anyway to try deleting other tables
    }
    
    // Wait for deletion to complete
    await delay(1000);
    
    // Delete pending employee shifts EXCEPT approved ones
    const { error: shiftsError } = await supabase
      .from('employee_shifts')
      .delete()
      .not('status', 'eq', 'approved')
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (shiftsError) {
      return {
        success: false,
        message: `Failed to delete employee shifts: ${shiftsError.message}`
      };
    }
    
    // Wait for deletion to complete
    await delay(1000);
    
    // Delete employee_shift_patterns
    const { error: patternsError } = await supabase
      .from('employee_shift_patterns')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (patternsError) {
      return {
        success: false,
        message: `Failed to delete shift patterns: ${patternsError.message}`
      };
    }
    
    return {
      success: true,
      message: `Reset complete. Deleted ${timeRecordsCount} non-approved time records while preserving approved records and holiday data.`
    };
  } catch (error) {
    console.error('Error resetting database:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during reset'
    };
  }
};

// Helper function to get employee ID from employee number
const getEmployeeId = async (employeeNumber: string): Promise<string> => {
  // Check cache first
  if (employeeIdCache.has(employeeNumber)) {
    return employeeIdCache.get(employeeNumber)!;
  }
  
  try {
    // Check if employee exists
    const { data, error } = await supabase
      .from('employees')
      .select('id, name')
      .eq('employee_number', employeeNumber)
      .maybeSingle();
    
    if (error) throw error;
    
    if (data) {
      // Store in cache
      employeeIdCache.set(employeeNumber, data.id);
      return data.id;
    }
    
    // Create new employee if not exists
    const { data: newEmployee, error: createError } = await supabase
      .from('employees')
      .insert([
        { employee_number: employeeNumber, name: `Employee #${employeeNumber}` }
      ])
      .select('id')
      .single();
    
    if (createError) throw createError;
    
    // Create user credentials for the new employee
    await createUserCredentials(newEmployee.id, employeeNumber);
    
    // Store in cache
    employeeIdCache.set(employeeNumber, newEmployee.id);
    return newEmployee.id;
  } catch (error) {
    console.error(`Error getting employee ID for ${employeeNumber}:`, error);
    throw error;
  }
};

// Helper function to create user credentials for a new employee
const createUserCredentials = async (employeeId: string, employeeNumber: string): Promise<void> => {
  try {
    // Get employee details for proper username
    const { data: employeeDetails, error: detailsError } = await supabase
      .from('employees')
      .select('name, employee_number')
      .eq('id', employeeId)
      .single();
      
    if (detailsError) throw detailsError;
    
    if (!employeeDetails) {
      console.error('Could not find employee details for ID:', employeeId);
      return;
    }
    
    // Generate username based on employee name and number
    let username;
    if (employeeDetails.name && employeeDetails.name !== `Employee #${employeeNumber}`) {
      // If we have a proper name, create a username from it
      const sanitizedName = employeeDetails.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove special characters
        .trim();
        
      username = `${sanitizedName}_${employeeNumber}`;
    } else {
      // Default username based on employee number
      username = `employee_${employeeNumber}`;
    }
    
    // Check if username already exists
    const { data: existingUsername, error: usernameError } = await supabase
      .from('user_credentials')
      .select('id')
      .ilike('username', username)
      .maybeSingle();
      
    if (usernameError) throw usernameError;
    
    // If username exists, append a number
    if (existingUsername) {
      let counter = 1;
      let newUsername;
      
      // Try up to 10 different usernames
      while (counter <= 10) {
        newUsername = `${username}${counter}`;
        
        const { data: checkNewUsername, error: checkError } = await supabase
          .from('user_credentials')
          .select('id')
          .ilike('username', newUsername)
          .maybeSingle();
          
        if (checkError) throw checkError;
        
        if (!checkNewUsername) {
          username = newUsername;
          break;
        }
        
        counter++;
      }
    }
    
    // Check if credentials already exist for this employee
    const { data: existingCreds, error: credsError } = await supabase
      .from('user_credentials')
      .select('id')
      .eq('employee_id', employeeId)
      .maybeSingle();
      
    if (credsError) throw credsError;
    
    if (existingCreds) {
      // Credentials already exist for this employee, skip creation
      console.log(`Credentials already exist for employee ID: ${employeeId}`);
      return;
    }
    
    // Create user credentials
    const { error: insertError } = await supabase
      .from('user_credentials')
      .insert([{
        employee_id: employeeId,
        username: username,
        password: employeeNumber // Use employee number as default password
      }]);
      
    if (insertError) throw insertError;
    
    console.log(`Created user credentials for employee ${employeeNumber} with username: ${username}`);
  } catch (error) {
    console.error('Error creating user credentials:', error);
    // Don't throw to prevent affecting the main operation flow
  }
};

// Clear employee ID cache - call this after operations that might modify employees
export const clearEmployeeIdCache = () => {
  employeeIdCache.clear();
};

// Save records to database
export const saveRecordsToDatabase = async (employeeRecords: EmployeeRecord[]): Promise<{
  successCount: number;
  errorCount: number;
  errorDetails: { employeeName: string; date: string; error: string }[];
}> => {
  let successCount = 0;
  let errorCount = 0;
  const errorDetails: { employeeName: string; date: string; error: string }[] = [];
  
  // Get double-time days for the date range
  const allDates: string[] = [];
  employeeRecords.forEach(employee => {
    employee.days.filter(day => day.approved).forEach(day => {
      allDates.push(day.date);
    });
  });
  
  // Sort and get min/max dates
  allDates.sort();
  const startDate = allDates[0] || format(new Date(), 'yyyy-MM-dd');
  const endDate = allDates[allDates.length - 1] || format(new Date(), 'yyyy-MM-dd');
  
  // Get all double-time days in this date range
  const doubleDays = await getDoubleTimeDays(startDate, endDate);
  console.log('Double-time days in range:', doubleDays);
  
  // Process each employee's approved days
  for (const employee of employeeRecords) {
    const approvedDays = employee.days.filter(day => day.approved);
    
    for (const day of approvedDays) {
      try {
        // Skip if this is an OFF-DAY with no hours
        if (day.notes === 'OFF-DAY' && day.hoursWorked === 0) {
          // Check if OFF-DAY record already exists
          const existingOffDayId = await checkExistingTimeRecord(
            await getEmployeeId(employee.employeeNumber),
            'off_day',
            'off_day',
            day.date
          );

          const offDayData = {
            employee_id: await getEmployeeId(employee.employeeNumber),
            timestamp: `${day.date}T12:00:00`, // Use local date-time string
            status: 'off_day',
            shift_type: 'off_day',
            notes: 'OFF-DAY',
            is_manual_entry: false, // Mark as non-manual entry since it's from Excel
            exact_hours: 0,
            working_week_start: day.date, // Set working_week_start for proper grouping
            display_check_in: 'OFF-DAY',
            display_check_out: 'OFF-DAY',
            approved: true // Set to approved since we're saving approved records
          };

          // Use the safe upsert function
          const success = await safeUpsertTimeRecord(offDayData, existingOffDayId);
          
          if (success) {
            successCount++;
          } else {
            throw new Error('Failed to save OFF-DAY record');
          }
          continue;
        }
        
        // Handle leave days (9 hours)
        if (day.notes && day.notes !== 'OFF-DAY' && day.notes.includes('leave')) {
          const leaveType = day.notes; // Store the leave type
          
          // Check if leave record already exists
          const existingLeaveId = await checkExistingTimeRecord(
            await getEmployeeId(employee.employeeNumber),
            'off_day',
            'off_day',
            day.date
          );
          
          const leaveData = {
            employee_id: await getEmployeeId(employee.employeeNumber),
            timestamp: `${day.date}T12:00:00`,
            status: 'off_day',
            shift_type: 'off_day',
            notes: leaveType, // Use the leave type as notes
            is_manual_entry: false,
            exact_hours: 9.0, // Set to 9 hours for leave days
            working_week_start: day.date,
            display_check_in: leaveType,
            display_check_out: leaveType,
            approved: true // Set to approved since we're saving approved records
          };
          
          // Use safe upsert function
          const success = await safeUpsertTimeRecord(leaveData, existingLeaveId);
          
          if (success) {
            successCount++;
          } else {
            throw new Error(`Failed to save leave record for ${leaveType}`);
          }
          continue;
        }
        
        // Skip if missing both check-in and check-out
        if (!day.firstCheckIn && !day.lastCheckOut) {
          errorCount++;
          errorDetails.push({
            employeeName: employee.name,
            date: day.date,
            error: 'Missing both check-in and check-out times'
          });
          continue;
        }
        
        // Get employee ID
        const employeeId = await getEmployeeId(employee.employeeNumber);
        
        // Check if this is a double-time day (Friday or holiday)
        const isDoubletime = doubleDays.includes(day.date) || isFriday(parseISO(day.date));
        
        // Add check-in record if available
        if (day.firstCheckIn) {
          // Store original check-in time as display value
          const checkInDisplayTime = format(day.firstCheckIn, 'HH:mm');

          // Use date-fns format directly with the Date object
          const checkInTimestamp = format(day.firstCheckIn, "yyyy-MM-dd'T'HH:mm:ss");
          
          // Check if check-in record already exists
          const existingCheckInId = await checkExistingTimeRecord(
            employeeId,
            day.shiftType || '',
            'check_in',
            day.date
          );
          
          // Add double-time indicator to notes if applicable
          let notes = day.notes ? `${day.notes}; hours:${day.hoursWorked.toFixed(2)}` : `hours:${day.hoursWorked.toFixed(2)}`;
          if (isDoubletime) {
            notes = `${notes}; double-time:true`;
          }

          const checkInData = {
            employee_id: employeeId,
            timestamp: checkInTimestamp,
            status: 'check_in',
            shift_type: day.shiftType,
            is_late: day.isLate,
            early_leave: false,
            deduction_minutes: day.penaltyMinutes,
            notes: notes,
            exact_hours: day.hoursWorked,
            display_check_in: checkInDisplayTime, // Store the actual time for display
            display_check_out: day.lastCheckOut ? format(day.lastCheckOut, 'HH:mm') : 'Missing',
            is_fixed: day.correctedRecords || false,
            corrected_records: day.correctedRecords || false,
            mislabeled: false,
            is_manual_entry: false, // Mark as non-manual entry since it's from Excel
            working_week_start: day.date,
            approved: true // Set to approved since we're saving approved records
          };

          // Use the safe upsert function
          const success = await safeUpsertTimeRecord(checkInData, existingCheckInId);
          
          if (!success) {
            throw new Error('Failed to save check-in record');
          }
        }
        
        // Add check-out record if available
        if (day.lastCheckOut) {
          // Store original check-out time as display value
          const checkOutDisplayTime = format(day.lastCheckOut, 'HH:mm');
          
          // Use date-fns format directly with the Date object
          const checkOutTimestamp = format(day.lastCheckOut, "yyyy-MM-dd'T'HH:mm:ss");
          
          // Check if check-out record already exists
          const existingCheckOutId = await checkExistingTimeRecord(
            employeeId,
            day.shiftType || '',
            'check_out',
            day.date
          );
          
          // Add double-time indicator to notes if applicable
          let notes = day.notes ? `${day.notes}; hours:${day.hoursWorked.toFixed(2)}` : `hours:${day.hoursWorked.toFixed(2)}`;
          if (isDoubletime) {
            notes = `${notes}; double-time:true`;
          }

          const checkOutData = {
            employee_id: employeeId,
            timestamp: checkOutTimestamp,
            status: 'check_out',
            shift_type: day.shiftType,
            is_late: false,
            early_leave: day.earlyLeave,
            deduction_minutes: day.penaltyMinutes,
            notes: notes,
            exact_hours: day.hoursWorked,
            display_check_in: day.firstCheckIn ? format(day.firstCheckIn, 'HH:mm') : 'Missing',
            display_check_out: checkOutDisplayTime, // Store the actual time for display
            is_fixed: day.correctedRecords || false,
            corrected_records: day.correctedRecords || false,
            mislabeled: false,
            is_manual_entry: false, // Mark as non-manual entry since it's from Excel
            working_week_start: day.date,
            approved: true // Set to approved since we're saving approved records
          };

          // Use the safe upsert function
          const success = await safeUpsertTimeRecord(checkOutData, existingCheckOutId);
          
          if (!success) {
            throw new Error('Failed to save check-out record');
          }
        }
        
        successCount++;
      } catch (error) {
        console.error(`Error saving record for ${employee.name} on ${day.date}:`, error);
        errorCount++;
        errorDetails.push({
          employeeName: employee.name,
          date: day.date,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  return { successCount, errorCount, errorDetails };
};

// Import missing functions from date-fns
import { startOfMonth, endOfMonth, subDays, addDays } from 'date-fns';