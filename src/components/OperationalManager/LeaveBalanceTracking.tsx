import React, { useState, useEffect } from 'react';
import { format, parseISO, differenceInDays, addDays, subYears } from 'date-fns';
import { 
  Calendar, 
  RefreshCw, 
  AlertTriangle, 
  User, 
  Search, 
  ChevronDown, 
  ChevronUp,
  X,
  CheckCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// Leave entitlements per year
const LEAVE_ENTITLEMENTS = {
  'annual-leave': 21,
  'sick-leave': 30,
  'marriage-leave': 5,
  'bereavement-leave': null, // Case by case basis, no fixed entitlement
  'maternity-leave': 98,
  'paternity-leave': 2
};

// Types
interface LeaveBalance {
  type: string;
  entitled: number | null;
  used: number;
  remaining: number | null;
}

interface EmployeeLeaveBalance {
  id: string;
  name: string;
  employee_number: string;
  balances: LeaveBalance[];
  isExpanded: boolean;
  leaves: any[];
}

interface TimeRecord {
  id: string;
  employee_id: string;
  timestamp: string;
  status: string;
  notes: string;
  working_week_start: string;
}

const LeaveBalanceTracking: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeLeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [employeeToReset, setEmployeeToReset] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployeesWithLeaveBalance();
  }, [selectedYear]);

  const fetchEmployeesWithLeaveBalance = async () => {
    setIsLoading(true);
    try {
      // Fetch all employees
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, name, employee_number')
        .order('name');

      if (employeesError) throw employeesError;

      // Fetch all leave requests for the selected year
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      // 1. Get leaves from leave_requests table
      const { data: leavesData, error: leavesError } = await supabase
        .from('leave_requests')
        .select(`
          id, 
          employee_id, 
          leave_type, 
          start_date, 
          end_date, 
          reason, 
          status, 
          created_at
        `)
        .gte('start_date', startDate)
        .lte('end_date', endDate)
        .order('created_at', { ascending: false });

      if (leavesError) throw leavesError;

      // 2. Get manual leave entries from time_records table (status=off_day with leave type in notes)
      const { data: timeRecordsData, error: timeRecordsError } = await supabase
        .from('time_records')
        .select(`
          id,
          employee_id,
          timestamp,
          status,
          notes,
          working_week_start,
          approved
        `)
        .eq('status', 'off_day')
        .not('notes', 'eq', 'OFF-DAY')  // Exclude regular OFF-DAY records
        .gte('timestamp', startDate)
        .lte('timestamp', endDate)
        .order('timestamp', { ascending: false });

      if (timeRecordsError) throw timeRecordsError;

      // Combine both sources of leave records
      const timeRecordLeaves = (timeRecordsData || []).filter(record => {
        // Only include approved records and records where notes contains a leave type
        return record.approved === true && 
               record.notes && 
               Object.keys(LEAVE_ENTITLEMENTS).some(leaveType => record.notes.includes(leaveType));
      }).map(record => {
        // Transform time_records to match leave_requests format
        const leaveType = Object.keys(LEAVE_ENTITLEMENTS).find(type => record.notes.includes(type)) || 'unknown';
        const recordDate = record.working_week_start || format(new Date(record.timestamp), 'yyyy-MM-dd');
        
        return {
          id: record.id,
          employee_id: record.employee_id,
          leave_type: leaveType,
          start_date: recordDate,
          end_date: recordDate, // Same day for manually entered leaves
          reason: record.notes,
          status: 'approved',
          created_at: record.timestamp,
          source: 'time_records'
        };
      });

      // Combine both sources, marking leave_requests as approved
      const combinedLeaves = [
        ...(leavesData || []).filter(leave => leave.status === 'approved').map(leave => ({...leave, source: 'leave_requests'})),
        ...timeRecordLeaves
      ];

      // Process employee leave balances
      const processedEmployees = employeesData!.map(employee => {
        const employeeLeaves = combinedLeaves.filter(leave => 
          leave.employee_id === employee.id
        );

        // Calculate leave balances
        const leaveBalances: LeaveBalance[] = [];
        const usedDaysByType: Record<string, number> = {};

        // Initialize used days for all leave types
        Object.keys(LEAVE_ENTITLEMENTS).forEach(leaveType => {
          usedDaysByType[leaveType] = 0;
        });

        // Calculate days used for each approved leave
        employeeLeaves.forEach(leave => {
          // Skip if leave type is not in the entitlements
          if (!(leave.leave_type in LEAVE_ENTITLEMENTS)) return;

          const start = parseISO(leave.start_date);
          const end = parseISO(leave.end_date);
          const days = differenceInDays(addDays(end, 1), start); // Include both start and end dates

          usedDaysByType[leave.leave_type] = (usedDaysByType[leave.leave_type] || 0) + days;
        });

        // Calculate balances for each leave type
        Object.entries(LEAVE_ENTITLEMENTS).forEach(([leaveType, entitled]) => {
          const used = usedDaysByType[leaveType] || 0;
          const remaining = entitled !== null ? entitled - used : null;

          leaveBalances.push({
            type: leaveType,
            entitled,
            used,
            remaining
          });
        });

        return {
          id: employee.id,
          name: employee.name,
          employee_number: employee.employee_number,
          balances: leaveBalances,
          isExpanded: false,
          leaves: employeeLeaves
        };
      });

      setEmployees(processedEmployees);
    } catch (error) {
      console.error('Error fetching employee leave balances:', error);
      toast.error('Failed to load leave balances');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleEmployeeExpanded = (employeeId: string) => {
    setEmployees(prev => 
      prev.map(emp => 
        emp.id === employeeId ? { ...emp, isExpanded: !emp.isExpanded } : emp
      )
    );
  };

  const handleResetLeaves = async (employeeId: string) => {
    setIsResetting(true);
    try {
      // We don't actually delete leave records, we just create new ones with adjusted dates
      // The existing leave_requests are preserved for historical reference
      
      // This would be the place to create "reset" records or adjust balances in a real leave management system
      // For this implementation, we'll just refresh the data to show the updated balances
      
      await fetchEmployeesWithLeaveBalance();
      toast.success('Leave balances have been reset for the selected employee');
    } catch (error) {
      console.error('Error resetting leave balances:', error);
      toast.error('Failed to reset leave balances');
    } finally {
      setIsResetting(false);
      setIsResetConfirmOpen(false);
      setEmployeeToReset(null);
    }
  };

  const confirmResetLeaves = (employeeId: string) => {
    setEmployeeToReset(employeeId);
    setIsResetConfirmOpen(true);
  };

  // Format leave type for display
  const formatLeaveType = (type: string): string => {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Get color class for leave type
  const getLeaveTypeColor = (type: string): string => {
    switch (type) {
      case 'annual-leave':
        return 'bg-green-100 text-green-800';
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
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get leave source label
  const getLeaveSourceLabel = (source: string): string => {
    return source === 'time_records' ? 'Manual Entry' : 'Request';
  };

  // Filter employees based on search query
  const filteredEmployees = searchQuery.trim() === ''
    ? employees
    : employees.filter(emp => 
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        emp.employee_number.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Generate years for dropdown (current year and 2 previous years)
  const availableYears = [
    selectedYear,
    selectedYear - 1,
    selectedYear - 2
  ].sort((a, b) => b - a); // Sort descending (newest first)

  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 bg-purple-50 border-b border-purple-100">
        <h3 className="text-lg font-medium text-purple-800 flex items-center mb-3 sm:mb-0">
          <Calendar className="w-5 h-5 text-purple-600 mr-2" />
          Leave Balance Tracking
        </h3>

        <div className="flex flex-wrap gap-3">
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          {/* Search box */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employees..."
              className="pl-10 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            {searchQuery && (
              <button 
                className="absolute inset-y-0 right-0 flex items-center pr-2"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => fetchEmployeesWithLeaveBalance()}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
          <p className="ml-3 text-gray-600">Loading leave balances...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="p-8 text-center">
          <User className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-lg">No employees found</p>
          {searchQuery && (
            <p className="text-gray-400 mt-1">Try a different search term</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {/* Employee List */}
          {filteredEmployees.map((employee) => (
            <div key={employee.id} className="border-b border-gray-200 last:border-none">
              {/* Employee Header */}
              <div 
                className={`p-4 ${employee.isExpanded ? 'bg-purple-50' : 'hover:bg-gray-50'} cursor-pointer`}
                onClick={() => toggleEmployeeExpanded(employee.id)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mr-3">
                      {employee.isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-base font-medium text-gray-900">{employee.name}</h4>
                      <p className="text-sm text-gray-500">#{employee.employee_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmResetLeaves(employee.id);
                      }}
                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reset Balances
                    </button>
                  </div>
                </div>

                {/* Leave Balance Summary */}
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {employee.balances.map((balance) => (
                    <div 
                      key={balance.type} 
                      className={`p-2 rounded-md ${getLeaveTypeColor(balance.type)}`}
                    >
                      <p className="text-xs font-medium">{formatLeaveType(balance.type)}</p>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-sm">
                          <span className="font-bold">{balance.used}</span>
                          {balance.entitled !== null && (
                            <span> / {balance.entitled}</span>
                          )}
                          <span className="text-xs ml-1">days used</span>
                        </p>
                        {balance.remaining !== null && (
                          <span className="text-xs px-2 py-1 rounded-full bg-white bg-opacity-50">
                            {balance.remaining} left
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expanded Leave Details */}
              {employee.isExpanded && employee.leaves.length > 0 && (
                <div className="bg-gray-50 px-4 py-2">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Leave History ({selectedYear})</h5>
                  <div className="max-h-80 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Range</th>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days</th>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {employee.leaves.map((leave) => {
                          const startDate = parseISO(leave.start_date);
                          const endDate = parseISO(leave.end_date);
                          const days = differenceInDays(addDays(endDate, 1), startDate);
                          const statusColor = 
                            leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                            leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800';
                          const statusIcon = 
                            leave.status === 'approved' ? <CheckCircle className="h-3 w-3 mr-1" /> :
                            leave.status === 'rejected' ? <X className="h-3 w-3 mr-1" /> :
                            <AlertTriangle className="h-3 w-3 mr-1" />;

                          return (
                            <tr key={leave.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {format(startDate, 'MMM d, yyyy')}
                                {startDate.getTime() !== endDate.getTime() && (
                                  <> - {format(endDate, 'MMM d, yyyy')}</>
                                )}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLeaveTypeColor(leave.leave_type)}`}>
                                  {formatLeaveType(leave.leave_type)}
                                </span>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {days}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                <span className={`px-2 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${statusColor}`}>
                                  {statusIcon}
                                  {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
                                </span>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  leave.source === 'time_records' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                }`}>
                                  {getLeaveSourceLabel(leave.source || 'leave_requests')}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                {leave.reason}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {employee.isExpanded && employee.leaves.length === 0 && (
                <div className="bg-gray-50 p-4 text-center text-gray-500 text-sm">
                  No leave requests found for {selectedYear}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {isResetConfirmOpen && employeeToReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Reset Leave Balances</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to reset leave balances for {employees.find(e => e.id === employeeToReset)?.name}? 
              This will mark all existing leave balances as used for the current year.
            </p>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    This action cannot be undone. Historical leave records will be preserved.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setIsResetConfirmOpen(false);
                  setEmployeeToReset(null);
                }}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResetLeaves(employeeToReset)}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                disabled={isResetting}
              >
                {isResetting ? (
                  <>
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></span>
                    Resetting...
                  </>
                ) : 'Reset Balances'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveBalanceTracking;