import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, isToday, isFriday, eachDayOfInterval, getDay, isSameDay, parseISO, isValid } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LeaveCalendarProps {
  employeeId: string;
  year: number;
  month: number;
}

interface LeaveDay {
  date: string;
  leaveType: string;
}

const LeaveCalendar: React.FC<LeaveCalendarProps> = ({ employeeId, year, month }) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(year, month - 1, 1));
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Update current date when year or month props change
    setCurrentDate(new Date(year, month - 1, 1));
  }, [year, month]);

  useEffect(() => {
    fetchLeaveDays();
  }, [employeeId, currentDate]);

  const fetchLeaveDays = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Calculate date range for the current month
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const startDate = format(monthStart, 'yyyy-MM-dd');
      const endDate = format(monthEnd, 'yyyy-MM-dd');
      
      // 1. Fetch approved leave requests that overlap with this month
      const { data: leaveRequestsData, error: leaveRequestsError } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('status', 'approved')
        .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);
        
      if (leaveRequestsError) throw leaveRequestsError;
      
      // 2. Fetch manual leave entries from time_records table
      const { data: timeRecordsData, error: timeRecordsError } = await supabase
        .from('time_records')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('status', 'off_day')
        .not('notes', 'eq', 'OFF-DAY') // Exclude regular OFF-DAY records
        .eq('approved', true) // Only include approved leave records
        .gte('timestamp', startDate)
        .lte('timestamp', endDate);
      
      if (timeRecordsError) throw timeRecordsError;
      
      // Process the data to get individual days
      const days: LeaveDay[] = [];
      
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
          days.push({
            date: format(date, 'yyyy-MM-dd'),
            leaveType: leave.leave_type
          });
        });
      });
      
      // Process manual leave entries from time_records
      timeRecordsData?.forEach(record => {
        if (record.approved && record.notes && record.notes !== 'OFF-DAY') {
          // Determine leave type from notes field
          const leaveTypes = Object.keys(LEAVE_ENTITLEMENTS);
          const leaveType = leaveTypes.find(type => record.notes.includes(type));
          
          if (leaveType) {
            const recordDate = record.working_week_start || format(new Date(record.timestamp), 'yyyy-MM-dd');
            
            // Only add if not already present (to avoid duplicates)
            if (!days.some(day => day.date === recordDate)) {
              days.push({
                date: recordDate,
                leaveType: leaveType
              });
            }
          }
        }
      });
      
      setLeaveDays(days);
    } catch (err) {
      console.error('Error fetching leave days:', err);
      setError('Failed to load leave calendar');
    } finally {
      setIsLoading(false);
    }
  };

  const previousMonth = () => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const nextMonth = () => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  const formatLeaveType = (type: string): string => {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getLeaveTypeColor = (type: string): string => {
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

  const renderCalendarDays = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = monthStart;
    const endDate = monthEnd;

    const dateFormat = 'd';
    const days = [];

    const daysInMonth = eachDayOfInterval({
      start: startDate,
      end: endDate
    });

    // Add empty cells for days before the start of the month
    const startDay = getDay(monthStart);
    for (let i = 0; i < startDay; i++) {
      days.push(
        <div key={`empty-${i}`} className="h-12 border border-transparent"></div>
      );
    }

    // Add the days of the month
    daysInMonth.forEach((day) => {
      const formattedDate = format(day, dateFormat);
      const dateStr = format(day, 'yyyy-MM-dd');
      const leaveDay = leaveDays.find(ld => ld.date === dateStr);
      const isLeaveDay = !!leaveDay;
      
      days.push(
        <div
          key={day.toString()}
          className={`h-12 border rounded-md flex flex-col items-center justify-center relative
            ${isLeaveDay ? getLeaveTypeColor(leaveDay.leaveType) : 'border-gray-200 hover:bg-gray-50'}`}
        >
          <span className="text-sm">{formattedDate}</span>
          {isLeaveDay && (
            <span className="text-[10px] mt-1 px-1 rounded font-medium">
              {formatLeaveType(leaveDay.leaveType)}
            </span>
          )}
        </div>
      );
    });

    return days;
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading leave calendar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <div className="flex items-center">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900 flex items-center">
        <CalendarIcon className="w-5 h-5 mr-2 text-purple-600" />
        Leave Calendar
      </h3>
      
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Calendar navigation */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <button
            onClick={previousMonth}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h3 className="text-base font-medium text-gray-900">
            {format(currentDate, 'MMMM yyyy')}
          </h3>
          <button
            onClick={nextMonth}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Calendar weekday headers */}
        <div className="grid grid-cols-7 gap-1 p-4 pb-0">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-xs font-medium text-gray-500 text-center py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1 p-4">
          {renderCalendarDays()}
        </div>
        
        {/* Legend */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">Leave Types:</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">Sick Leave</span>
            <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-800">Marriage Leave</span>
            <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-800">Bereavement Leave</span>
            <span className="px-2 py-0.5 text-xs rounded bg-pink-100 text-pink-800">Maternity Leave</span>
            <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800">Paternity Leave</span>
            <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">Annual Leave</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Leave entitlements reference
const LEAVE_ENTITLEMENTS: Record<string, number | null> = {
  'annual-leave': 21,
  'sick-leave': 30,
  'marriage-leave': 5,
  'bereavement-leave': null,
  'maternity-leave': 98,
  'paternity-leave': 2
};

export default LeaveCalendar;