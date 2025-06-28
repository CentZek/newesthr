import React, { useState, useEffect } from 'react';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { Calendar, CheckCircle, XCircle, Clock, Clock4, PieChart, Calendar as Calendar2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LeaveRequestListProps {
  employeeId: string;
  onNewRequest: () => void;
}

const LeaveRequestList: React.FC<LeaveRequestListProps> = ({ employeeId, onNewRequest }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [leaveStats, setLeaveStats] = useState<{[key: string]: number}>({});
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    fetchLeaveRequests();
  }, [employeeId, yearFilter]);

  const fetchLeaveRequests = async () => {
    setIsLoading(true);
    try {
      const startDate = `${yearFilter}-01-01`;
      const endDate = `${yearFilter}-12-31`;
      
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('start_date', startDate)
        .lte('end_date', endDate)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Calculate totals by leave type - only count approved leaves
      const stats: {[key: string]: number} = {};
      (data || []).forEach(request => {
        if (request.status === 'approved') {
          const start = parseISO(request.start_date);
          const end = parseISO(request.end_date);
          const days = differenceInDays(addDays(end, 1), start);
          
          if (!stats[request.leave_type]) {
            stats[request.leave_type] = 0;
          }
          stats[request.leave_type] += days;
        }
      });
      
      setLeaveStats(stats);
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching leave requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'approved':
        return { 
          color: 'bg-green-100 text-green-800', 
          icon: <CheckCircle className="w-4 h-4 mr-1" /> 
        };
      case 'rejected':
        return { 
          color: 'bg-red-100 text-red-800', 
          icon: <XCircle className="w-4 h-4 mr-1" /> 
        };
      default:
        return { 
          color: 'bg-amber-100 text-amber-800', 
          icon: <Clock className="w-4 h-4 mr-1" /> 
        };
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
        return 'bg-blue-100 text-blue-800';
    }
  };

  const calculateDuration = (startDate: string, endDate: string): number => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    return differenceInDays(addDays(end, 1), start); // Add 1 to include end date
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-700"></div>
      </div>
    );
  }

  // Filter for approved leaves only for the summary section
  const approvedLeavesOnly = Object.fromEntries(
    Object.entries(leaveStats).filter(([_, value]) => value > 0)
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Calendar2 className="w-5 h-5 mr-2 text-purple-600" />
          Your Leave Requests
        </h3>
        
        <button
          onClick={onNewRequest}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <Calendar className="h-4 w-4 mr-1" />
          New Request
        </button>
      </div>
      
      {/* Leave statistics summary - only shows approved leaves */}
      <div className="mb-6 bg-gray-50 rounded-md p-4 border border-gray-200">
        <div className="flex items-center mb-3">
          <PieChart className="w-4 h-4 text-purple-600 mr-2" />
          <h4 className="text-sm font-medium text-gray-800">Leave Summary ({yearFilter})</h4>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.keys(approvedLeavesOnly).length === 0 ? (
            <p className="text-sm text-gray-500 col-span-full">No approved leave requests for {yearFilter}</p>
          ) : (
            Object.entries(approvedLeavesOnly).map(([type, days]) => (
              <div key={type} className={`p-3 rounded-md ${getLeaveTypeColor(type)}`}>
                <div className="text-sm font-medium">{formatLeaveType(type)}</div>
                <div className="text-2xl font-bold mt-1">{days} <span className="text-sm">days</span></div>
              </div>
            ))
          )}
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-lg border border-gray-200">
          <Clock4 className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No leave requests</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new leave request.</p>
          <div className="mt-6">
            <button
              type="button"
              onClick={onNewRequest}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <Calendar className="-ml-1 mr-2 h-5 w-5" />
              New Leave Request
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 bg-white rounded-lg border border-gray-200 p-4">
          {requests.map((request) => {
            const statusDisplay = getStatusDisplay(request.status);
            const duration = calculateDuration(request.start_date, request.end_date);
            
            return (
              <div key={request.id} className="border rounded-md p-4 hover:bg-gray-50">
                <div className="flex justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <h4 className="text-base font-medium text-gray-900">{formatLeaveType(request.leave_type)}</h4>
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full flex items-center ${statusDisplay.color}`}>
                        {statusDisplay.icon}
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                      <span className="ml-2 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {duration} day{duration !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      <span className="font-medium">
                        {format(parseISO(request.start_date), 'MMM d, yyyy')}
                        {request.start_date !== request.end_date && ` – ${format(parseISO(request.end_date), 'MMM d, yyyy')}`}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{request.reason}</p>
                  </div>
                  <div className="text-xs text-gray-500">
                    {format(parseISO(request.created_at), 'MMM d, yyyy')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LeaveRequestList;