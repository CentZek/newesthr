import React, { useState, useEffect } from 'react';
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';

interface LeaveStatisticsProps {
  employeeId: string;
  year: number;
}

interface LeaveCount {
  leaveType: string;
  count: number;
  totalDays: number;
}

// Leave entitlements reference
const LEAVE_ENTITLEMENTS: Record<string, number | null> = {
  'annual-leave': 21,
  'sick-leave': 30,
  'marriage-leave': 5,
  'bereavement-leave': null,
  'maternity-leave': 98,
  'paternity-leave': 2
};

const LeaveStatistics: React.FC<LeaveStatisticsProps> = ({ employeeId, year }) => {
  const [leaveStats, setLeaveStats] = useState<LeaveCount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaveStatistics();
  }, [employeeId, year]);

  const fetchLeaveStatistics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Calculate date range for the selected year
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      // 1. Fetch approved leave requests for this employee in the selected year
      const { data: leaveRequestsData, error: leaveRequestsError } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('status', 'approved')  // Only approved leaves
        .gte('start_date', startDate)
        .lte('end_date', endDate);
        
      if (leaveRequestsError) throw leaveRequestsError;
      
      // 2. Fetch manually entered leave records from time_records
      const { data: timeRecordsData, error: timeRecordsError } = await supabase
        .from('time_records')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('status', 'off_day')
        .not('notes', 'eq', 'OFF-DAY') // Exclude regular OFF-DAY records
        .eq('approved', true) // Only approved leaves
        .gte('timestamp', startDate)
        .lte('timestamp', endDate);
        
      if (timeRecordsError) throw timeRecordsError;
      
      // Process the data to count days by leave type
      const leaveCountMap = new Map<string, { count: number; totalDays: number }>();
      
      // Process leave requests
      leaveRequestsData?.forEach(leave => {
        const leaveType = leave.leave_type;
        const start = parseISO(leave.start_date);
        const end = parseISO(leave.end_date);
        
        // Calculate number of days (inclusive of start and end date)
        const dayDiff = differenceInDays(addDays(end, 1), start);
        
        if (leaveCountMap.has(leaveType)) {
          const current = leaveCountMap.get(leaveType)!;
          leaveCountMap.set(leaveType, {
            count: current.count + 1,
            totalDays: current.totalDays + dayDiff
          });
        } else {
          leaveCountMap.set(leaveType, { count: 1, totalDays: dayDiff });
        }
      });
      
      // Process manual leave entries from time_records
      timeRecordsData?.forEach(record => {
        if (record.notes) {
          // Find which leave type this record corresponds to
          const leaveType = Object.keys(LEAVE_ENTITLEMENTS).find(type => 
            record.notes.includes(type)
          );
          
          if (leaveType) {
            if (leaveCountMap.has(leaveType)) {
              const current = leaveCountMap.get(leaveType)!;
              leaveCountMap.set(leaveType, {
                count: current.count + 1,
                totalDays: current.totalDays + 1 // Manual entries are for a single day
              });
            } else {
              leaveCountMap.set(leaveType, { count: 1, totalDays: 1 });
            }
          }
        }
      });
      
      // Convert map to array for rendering
      const stats: LeaveCount[] = Array.from(leaveCountMap.entries()).map(([leaveType, { count, totalDays }]) => ({
        leaveType,
        count,
        totalDays
      }));
      
      setLeaveStats(stats);
    } catch (error) {
      console.error('Error fetching leave statistics:', error);
      setError('Failed to load leave statistics');
    } finally {
      setIsLoading(false);
    }
  };

  const formatLeaveType = (type: string): string => {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getLeaveTypeColor = (type: string): string => {
    switch (type) {
      case 'sick-leave':
        return 'bg-red-100 text-red-800';
      case 'annual-leave':
        return 'bg-green-100 text-green-800';
      case 'marriage-leave':
        return 'bg-purple-100 text-purple-800';
      case 'bereavement-leave':
        return 'bg-gray-100 text-gray-800';
      case 'maternity-leave':
        return 'bg-pink-100 text-pink-800';
      case 'paternity-leave':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get 2-letter abbreviation for leave types
  const getLeaveTypeAbbreviation = (type: string): string => {
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

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading leave statistics...</p>
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

  // Filter out leave types with 0 days for cleaner display
  const activeLeaveStats = leaveStats.filter(stat => stat.totalDays > 0);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900 flex items-center">
        <Calendar className="w-5 h-5 mr-2 text-purple-600" />
        Leave Statistics ({year})
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {activeLeaveStats.length > 0 ? (
          activeLeaveStats.map((stat) => (
            <div 
              key={stat.leaveType} 
              className={`p-4 rounded-md ${getLeaveTypeColor(stat.leaveType)}`}
            >
              <div className="flex items-center">
                <h4 className="font-medium">{formatLeaveType(stat.leaveType)}</h4>
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-white bg-opacity-50">
                  {getLeaveTypeAbbreviation(stat.leaveType)}
                </span>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <div>
                  <p className="text-2xl font-bold">{stat.totalDays}</p>
                  <p className="text-xs">days used</p>
                </div>
                <div className="text-xs">
                  {stat.count} request{stat.count !== 1 ? 's' : ''}
                </div>
              </div>
              
              {LEAVE_ENTITLEMENTS[stat.leaveType] !== null && (
                <div className="mt-2 text-xs">
                  <div className="flex justify-between">
                    <span>Entitled:</span>
                    <span>{LEAVE_ENTITLEMENTS[stat.leaveType] || 0} days</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Remaining:</span>
                    <span>{Math.max(0, (LEAVE_ENTITLEMENTS[stat.leaveType] || 0) - stat.totalDays)} days</span>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="col-span-full p-4 bg-gray-50 border border-gray-200 rounded-md text-center">
            <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">No approved leave requests found for {year}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveStatistics;