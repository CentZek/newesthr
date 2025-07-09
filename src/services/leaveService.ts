import { supabase } from '../lib/supabase';
import { format, parseISO, eachDayOfInterval, isValid, differenceInDays, addDays } from 'date-fns';

// Fetch leave statistics for an employee
export const getLeaveStatistics = async (employeeId: string, year: number) => {
  try {
    // Calculate date range for the year
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    // Fetch approved leave requests for this employee in the selected year
    const { data: leaveRequestsData, error: leaveRequestsError } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .gte('start_date', startDate)
      .lte('end_date', endDate);
      
    if (leaveRequestsError) throw leaveRequestsError;
    
    // Fetch manually entered leaves from time_records table
    const { data: timeRecordsData, error: timeRecordsError } = await supabase
      .from('time_records')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'off_day')
      .not('notes', 'eq', 'OFF-DAY') // Exclude regular OFF-DAY records
      .eq('approved', true)
      .gte('timestamp', startDate)
      .lte('timestamp', endDate);
    
    if (timeRecordsError) throw timeRecordsError;
    
    // Process the data to count days by leave type
    const leaveStats = new Map<string, { count: number; totalDays: number }>();
    
    // Process leave requests
    leaveRequestsData?.forEach(leave => {
      if (!isValid(parseISO(leave.start_date)) || !isValid(parseISO(leave.end_date))) {
        console.warn('Invalid date in leave request:', leave);
        return;
      }
      
      const leaveType = leave.leave_type;
      const start = parseISO(leave.start_date);
      const end = parseISO(leave.end_date);
      
      // Calculate number of days (inclusive of start and end date)
      const dayDiff = differenceInDays(addDays(end, 1), start);
      
      if (leaveStats.has(leaveType)) {
        const current = leaveStats.get(leaveType)!;
        leaveStats.set(leaveType, {
          count: current.count + 1,
          totalDays: current.totalDays + dayDiff
        });
      } else {
        leaveStats.set(leaveType, { count: 1, totalDays: dayDiff });
      }
    });
    
    // Process manual leave entries from time_records
    timeRecordsData?.forEach(record => {
      if (record.notes) {
        // Find which leave type this record corresponds to
        const leaveTypes = ['sick-leave', 'annual-leave', 'marriage-leave', 
                          'bereavement-leave', 'maternity-leave', 'paternity-leave'];
        
        const leaveType = leaveTypes.find(type => record.notes.includes(type));
        
        if (leaveType) {
          if (leaveStats.has(leaveType)) {
            const current = leaveStats.get(leaveType)!;
            leaveStats.set(leaveType, {
              count: current.count + 1,
              totalDays: current.totalDays + 1 // Manual entries are for a single day
            });
          } else {
            leaveStats.set(leaveType, { count: 1, totalDays: 1 });
          }
        }
      }
    });
    
    // Convert map to array for easier consumption
    return Array.from(leaveStats.entries()).map(([leaveType, { count, totalDays }]) => ({
      leaveType,
      count,
      totalDays
    }));
  } catch (error) {
    console.error('Error fetching leave statistics:', error);
    throw error;
  }
};

// Fetch leave days for calendar display
export const getLeaveDaysForCalendar = async (employeeId: string, year: number, month: number) => {
  try {
    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of the month
    
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');
    
    // 1. Fetch approved leave requests that overlap with this month
    const { data: leaveRequestsData, error: leaveRequestsError } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .or(`start_date.lte.${endDateStr},end_date.gte.${startDateStr}`);
      
    if (leaveRequestsError) throw leaveRequestsError;
    
    // 2. Fetch manual leave entries from time_records
    const { data: timeRecordsData, error: timeRecordsError } = await supabase
      .from('time_records')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'off_day')
      .not('notes', 'eq', 'OFF-DAY') // Exclude regular OFF-DAY records
      .eq('approved', true) // Only include approved records
      .gte('timestamp', startDateStr)
      .lte('timestamp', endDateStr);
    
    if (timeRecordsError) throw timeRecordsError;
    
    // Process the data to get individual days
    const leaveDays: { date: string; leaveType: string }[] = [];
    
    // Process leave requests
    leaveRequestsData?.forEach(leave => {
      if (!isValid(parseISO(leave.start_date)) || !isValid(parseISO(leave.end_date))) {
        console.warn('Invalid date in leave request:', leave);
        return;
      }
      
      const start = parseISO(leave.start_date);
      const end = parseISO(leave.end_date);
      
      // Get all days in the leave period
      const datesInRange = eachDayOfInterval({ start, end });
      
      // Add each day to our array
      datesInRange.forEach(date => {
        // Only include days that fall within the requested month
        if (date.getMonth() + 1 === month && date.getFullYear() === year) {
          leaveDays.push({
            date: format(date, 'yyyy-MM-dd'),
            leaveType: leave.leave_type
          });
        }
      });
    });
    
    // Process manual leave entries from time_records
    timeRecordsData?.forEach(record => {
      if (record.notes) {
        // Find which leave type this record corresponds to
        const leaveTypes = ['sick-leave', 'annual-leave', 'marriage-leave', 
                          'bereavement-leave', 'maternity-leave', 'paternity-leave'];
        
        const leaveType = leaveTypes.find(type => record.notes.includes(type));
        
        if (leaveType) {
          const recordDate = record.working_week_start || format(new Date(record.timestamp), 'yyyy-MM-dd');
          const recordDateObj = parseISO(recordDate);
          
          // Only add if it's in the current month and not already in the list
          if (recordDateObj.getMonth() + 1 === month && recordDateObj.getFullYear() === year &&
              !leaveDays.some(day => day.date === recordDate)) {
            leaveDays.push({
              date: recordDate,
              leaveType: leaveType
            });
          }
        }
      }
    });
    
    return leaveDays;
  } catch (error) {
    console.error('Error fetching leave days for calendar:', error);
    throw error;
  }
};

// Get 2-letter abbreviation for leave type
export const getLeaveTypeAbbreviation = (type: string): string => {
  switch (type) {
    case 'sick-leave':
      return 'SL';
    case 'annual-leave':
      return 'AL';
    case 'marriage-leave':
      return 'ML';
    case 'bereavement-leave':
      return 'BL';
    case 'maternity-leave':
      return 'MT';
    case 'paternity-leave':
      return 'PT';
    default:
      return type.substring(0, 2).toUpperCase();
  }
};

// Format leave type for display
export const formatLeaveType = (type: string): string => {
  return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// Get color for leave type
export const getLeaveTypeColor = (type: string): string => {
  switch (type) {
    case 'sick-leave':
      return 'bg-red-100 text-red-800';
    case 'marriage-leave':
      return 'bg-purple-100 text-purple-800';
    case 'bereavement-leave':
      return 'bg-gray-100 text-gray-800';
    case 'maternity-leave':
      return 'bg-pink-100 text-pink-800';
    case 'paternity-leave':
      return 'bg-blue-100 text-blue-800';
    case 'annual-leave':
      return 'bg-green-100 text-green-800';
    case 'unpaid-leave':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};