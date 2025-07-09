import React from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isToday, 
  isSameDay, 
  parseISO, 
  isSameMonth,
  isWithinInterval,
  getDay
} from 'date-fns';
import { Calendar as CalendarIcon, Clock, CheckCircle, XCircle, AlertTriangle, Briefcase } from 'lucide-react';

interface LeaveDay {
  date: string;
  leaveType: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface LeaveCalendarViewProps {
  currentMonth: Date;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  leaveData: LeaveDay[];
  approvedShifts: any[];
}

const LeaveCalendarView: React.FC<LeaveCalendarViewProps> = ({ 
  currentMonth, 
  selectedDate, 
  onDateSelect,
  leaveData,
  approvedShifts
}) => {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
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

  // Get leave type color
  const getLeaveTypeColor = (type: string): string => {
    switch (type) {
      case 'sick-leave':
        return 'bg-red-100 border-red-300';
      case 'annual-leave':
        return 'bg-green-100 border-green-300';
      case 'marriage-leave':
        return 'bg-purple-100 border-purple-300';
      case 'bereavement-leave':
        return 'bg-gray-100 border-gray-300';
      case 'maternity-leave':
        return 'bg-pink-100 border-pink-300';
      case 'paternity-leave':
        return 'bg-blue-100 border-blue-300';
      case 'unpaid-leave':
        return 'bg-orange-100 border-orange-300';
      default:
        return 'bg-blue-100 border-blue-300';
    }
  };

  // Get status indicators for a date
  const getStatusIndicators = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const indicators = [];
    
    // Check for leave request
    const leaveDay = leaveData.find(leave => leave.date === dateStr);
    if (leaveDay) {
      if (leaveDay.status === 'approved') {
        indicators.push(
          <span key="leave-approved" className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500"></span>
        );
      } else if (leaveDay.status === 'rejected') {
        indicators.push(
          <span key="leave-rejected" className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"></span>
        );
      } else {
        indicators.push(
          <span key="leave-pending" className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500"></span>
        );
      }
    }
    
    // Check for shift
    const dayShifts = approvedShifts.filter(shift => isSameDay(parseISO(shift.date), date));
    const hasPendingShift = dayShifts.some(shift => shift.status === 'pending');
    const hasConfirmedShift = dayShifts.some(shift => shift.status === 'confirmed');
    const hasApprovedRecord = dayShifts.some(shift => shift.is_approved_record === true);
    
    if (hasPendingShift) {
      indicators.push(
        <span key="shift-pending" className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-amber-500"></span>
      );
    } else if (hasConfirmedShift && !hasApprovedRecord) {
      indicators.push(
        <span key="shift-confirmed" className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-green-500"></span>
      );
    } else if (hasApprovedRecord) {
      indicators.push(
        <span key="shift-approved" className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-blue-500"></span>
      );
    }
    
    return indicators;
  };

  // Check if date has leave and get type
  const getLeaveForDate = (date: Date): LeaveDay | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaveData.find(leave => leave.date === dateStr) || null;
  };

  // Add the days of the month
  daysInMonth.forEach((day) => {
    const formattedDate = format(day, dateFormat);
    const isCurrentDay = isToday(day);
    const isSelectedDay = selectedDate && isSameDay(day, selectedDate);
    const isCurrentMonth = isSameMonth(day, currentMonth);
    
    // Get leave for this day
    const leave = getLeaveForDate(day);
    const leaveClass = leave ? getLeaveTypeColor(leave.leaveType) : '';
    
    days.push(
      <div
        key={day.toString()}
        className={`h-12 border rounded-md flex flex-col items-center justify-center relative cursor-pointer transition-colors
          ${isCurrentDay ? 'border-purple-500 font-bold' : 'border-gray-200'}
          ${isSelectedDay ? 'bg-purple-100 border-purple-400' : 'hover:bg-gray-50'}
          ${leaveClass}
          ${!isCurrentMonth ? 'text-gray-400' : ''}
        `}
        onClick={() => onDateSelect(day)}
      >
        <span className={`text-sm ${isSelectedDay ? 'text-purple-800' : ''}`}>{formattedDate}</span>
        {getStatusIndicators(day)}
      </div>
    );
  });

  return (
    <div>
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days}
      </div>

      {/* Calendar key */}
      <div className="flex justify-center mt-4 flex-wrap gap-4 text-xs text-gray-500">
        <div className="flex items-center">
          <span className="h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
          <span>Pending</span>
        </div>
        <div className="flex items-center">
          <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
          <span>Confirmed</span>
        </div>
        <div className="flex items-center">
          <span className="h-2 w-2 rounded-full bg-blue-500 mr-1"></span>
          <span>Approved Record</span>
        </div>
      </div>
      
      {/* Leave type key */}
      <div className="flex justify-center mt-3 flex-wrap gap-2 text-xs">
        <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full">
          <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1"></span>
          Sick Leave
        </span>
        <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
          Annual Leave
        </span>
        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full">
          <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mr-1"></span>
          Marriage Leave
        </span>
      </div>
    </div>
  );
};

export default LeaveCalendarView;