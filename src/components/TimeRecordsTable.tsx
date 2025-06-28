import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { DISPLAY_SHIFT_TIMES } from '../types';
import { formatTime24H, formatRecordTime } from '../utils/dateTimeHelper';

interface TimeRecord {
  id: string;
  employee_id: string;
  timestamp: string;
  status: 'check_in' | 'check_out' | 'off_day';
  shift_type: 'morning' | 'evening' | 'night' | 'canteen' | null;
  is_late: boolean;
  early_leave: boolean;
  deduction_minutes: number;
  notes?: string;
  employees?: {
    name: string;
    employee_number: string;
  };
  working_week_start?: string;
  display_check_in?: string;
  display_check_out?: string;
  is_manual_entry?: boolean;
}

interface TimeRecordsTableProps {
  records: TimeRecord[];
  isLoading?: boolean;
  title?: string;
}

const TimeRecordsTable: React.FC<TimeRecordsTableProps> = ({ 
  records,
  isLoading = false,
  title = 'Manual Time Records'
}) => {
  const [isMobile, setIsMobile] = useState(false);

  // Check if we're on mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);
  
  // Group records by date and employee
  const groupedRecords = React.useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};
    
    records.forEach(record => {
      // Handle OFF-DAY records specially
      if (record.status === 'off_day' || record.notes?.includes('OFF-DAY') || record.notes?.includes('leave')) {
        // Use working_week_start if available, otherwise use timestamp date
        let dateKey = record.working_week_start || '';
        if (!dateKey) {
          const utc = parseISO(record.timestamp);
          dateKey = utc.toISOString().slice(0,10);  // "YYYY-MM-DD"
        }
        
        const employeeId = record.employee_id;
        
        if (!groups[dateKey]) {
          groups[dateKey] = {};
        }
        
        if (!groups[dateKey][employeeId]) {
          groups[dateKey][employeeId] = [];
        }
        
        groups[dateKey][employeeId].push({
          ...record,
          status: 'off_day' // Ensure status is set
        });
        
        return;
      }
      
      // FIXED: ALWAYS use working_week_start for consistent grouping
      let dateKey = record.working_week_start || '';
      
      // If working_week_start is not available, extract from timestamp
      if (!dateKey) {
        // Use the UTC date portion so nothing shifts under local timezones
        const utc = parseISO(record.timestamp);
        dateKey = utc.toISOString().slice(0,10);  // "YYYY-MM-DD"
      }

      if (!groups[dateKey]) {
        groups[dateKey] = {};
      }
      
      const employeeId = record.employee_id;
      
      if (!groups[dateKey][employeeId]) {
        groups[dateKey][employeeId] = [];
      }
      
      groups[dateKey][employeeId].push({
        ...record,
        date: dateKey
      });
    });
    
    return groups;
  }, [records]);
  
  // Calculate pairs of check-in/check-out
  const processedRecords = React.useMemo(() => {
    const result: any[] = [];
    const processedDates = new Set<string>();
    
    // Process each date
    Object.entries(groupedRecords).forEach(([date, employeeRecords]) => {
      // Skip if this date was already processed
      if (processedDates.has(date)) return;
      
      Object.entries(employeeRecords).forEach(([employeeId, records]) => {
        // Check if this is an off day or leave day
        const offDayRecords = records.filter(r => r.status === 'off_day' || r.notes?.includes('OFF-DAY'));
        const leaveRecords = records.filter(r => r.notes && r.notes !== 'OFF-DAY' && r.notes.includes('leave'));
        
        if (offDayRecords.length > 0) {
          // Add off day records with special formatting
          const firstOffDayRecord = offDayRecords[0];
          
          result.push({
            date,
            employeeId,
            employeeName: firstOffDayRecord.employees?.name || 'Unknown Employee',
            employeeNumber: firstOffDayRecord.employees?.employee_number || 'Unknown',
            isOffDay: true,
            isLeave: false,
            notes: 'OFF-DAY',
            display_check_in: 'OFF-DAY',
            display_check_out: 'OFF-DAY'
          });
          
          processedDates.add(date);
          return;
        }
        
        if (leaveRecords.length > 0) {
          // Add leave day records with special formatting
          const firstLeaveRecord = leaveRecords[0];
          const leaveType = firstLeaveRecord.notes;
          
          result.push({
            date,
            employeeId,
            employeeName: firstLeaveRecord.employees?.name || 'Unknown Employee',
            employeeNumber: firstLeaveRecord.employees?.employee_number || 'Unknown',
            isOffDay: false,
            isLeave: true,
            notes: leaveType,
            display_check_in: leaveType,
            display_check_out: leaveType
          });
          
          processedDates.add(date);
          return;
        }
        
        // Group records by shift_type
        const recordsByShiftType: Record<string, any[]> = {};
        
        records.forEach(record => {
          const shiftType = record.shift_type || 'unknown';
          if (!recordsByShiftType[shiftType]) {
            recordsByShiftType[shiftType] = [];
          }
          recordsByShiftType[shiftType].push(record);
        });
        
        // Process each shift type separately
        Object.entries(recordsByShiftType).forEach(([shiftType, shiftRecords]) => {
          // Sort check-in records by timestamp (earliest first)
          const sortedCheckIns = shiftRecords.filter(r => r.status === 'check_in').sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          // Sort check-out records by timestamp (latest first) - we want the latest checkout
          const sortedCheckOuts = shiftRecords.filter(r => r.status === 'check_out').sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          
          // Use earliest check-in and latest check-out
          const checkIn = sortedCheckIns.length > 0 ? sortedCheckIns[0] : null;
          const checkOut = sortedCheckOuts.length > 0 ? sortedCheckOuts[0] : null;
          
          // Only add a record if there's at least a check-in or checkout
          if (checkIn || checkOut) {
            // Get standardized display times based on shift type
            const standardDisplayTimes = {
              morning: { checkIn: '05:00', checkOut: '14:00' },
              evening: { checkIn: '13:00', checkOut: '22:00' },
              night: { checkIn: '21:00', checkOut: '06:00' },
              canteen: { checkIn: '07:00', checkOut: '16:00' }
            };
            
            // Use these standard display times for manual entries
            let displayCheckIn = '';
            let displayCheckOut = '';
            
            if (shiftType in standardDisplayTimes) {
              displayCheckIn = standardDisplayTimes[shiftType as keyof typeof standardDisplayTimes].checkIn;
              displayCheckOut = standardDisplayTimes[shiftType as keyof typeof standardDisplayTimes].checkOut;
            } else {
              // If we don't have standard times for this shift type, use the actual record values
              displayCheckIn = checkIn?.display_check_in || (checkIn ? formatTime24H(new Date(checkIn.timestamp)) : 'Missing');
              displayCheckOut = checkOut?.display_check_out || (checkOut ? formatTime24H(new Date(checkOut.timestamp)) : 'Missing');
            }
            
            // But always prefer the display values if explicitly set on the records
            if (checkIn?.display_check_in && checkIn.display_check_in !== 'Missing') {
              displayCheckIn = checkIn.display_check_in;
            }
            
            if (checkOut?.display_check_out && checkOut.display_check_out !== 'Missing') {
              displayCheckOut = checkOut.display_check_out;
            }
            
            // For manual entries, always use standard times based on shift type
            const isManualEntry = checkIn?.is_manual_entry || checkOut?.is_manual_entry;
            if (isManualEntry && shiftType in standardDisplayTimes) {
              displayCheckIn = standardDisplayTimes[shiftType as keyof typeof standardDisplayTimes].checkIn;
              displayCheckOut = standardDisplayTimes[shiftType as keyof typeof standardDisplayTimes].checkOut;
            }
            
            result.push({
              date,
              employeeId,
              employeeName: (checkIn || checkOut)?.employees?.name || 'Unknown',
              employeeNumber: (checkIn || checkOut)?.employees?.employee_number || 'Unknown',
              checkIn,
              checkOut,
              shiftType,
              isManualEntry,
              recordCount: shiftRecords.length,
              display_check_in: displayCheckIn,
              display_check_out: displayCheckOut
            });
          }
        });
        
        processedDates.add(date);
      });
    });
    
    return result;
  }, [groupedRecords]);

  // Get time in 24-hour format
  const getActualTime = (record: any) => {
    if (!record) return '—';
    
    // Use display value if available
    if (record.status === 'check_in' && record.display_check_in && record.display_check_in !== 'Missing') {
      return record.display_check_in;
    }
    
    if (record.status === 'check_out' && record.display_check_out && record.display_check_out !== 'Missing') {
      return record.display_check_out;
    }
    
    // Fall back to formatting the timestamp
    try {
      return formatTime24H(new Date(record.timestamp));
    } catch (error) {
      console.error('Error formatting time:', error);
      return '—';
    }
  };
  
  if (isLoading) {
    return (
      <div className="mt-4 p-8 text-center bg-white border border-gray-200 rounded-md shadow-sm">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500">Loading time records...</p>
      </div>
    );
  }
  
  if (records.length === 0) {
    return (
      <div className="mt-4 p-8 text-center bg-white border border-gray-200 rounded-md shadow-sm">
        <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <h3 className="text-gray-600 font-medium">No manual time records</h3>
        <p className="text-sm text-gray-500 mt-1">
          Manually added time records will appear here.
        </p>
      </div>
    );
  }
  
  // Mobile Card View
  if (isMobile) {
    return (
      <div className="mt-4 bg-white border border-gray-200 rounded-md shadow-sm">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 flex items-center">
            <Clock className="w-4 h-4 text-gray-500 mr-2" />
            {title}
          </h3>
        </div>
        
        <div className="overflow-y-auto max-h-90vh px-4 py-2 space-y-3">
          {processedRecords.map((record, index) => (
            <div key={index} className={`p-3 border border-gray-200 rounded-md ${
              record.isOffDay ? 'bg-gray-50' : (record.isLeave ? 'bg-blue-50' : '')
            }`}>
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium text-gray-800 text-wrap-balance">{record.employeeName}</h4>
                <span className="text-xs text-gray-500">#{record.employeeNumber}</span>
              </div>
              
              <div className="text-xs text-gray-500 mb-2">
                {format(new Date(record.date), 'EEE, MMM d, yyyy')}
              </div>
              
              {record.isOffDay || record.isLeave ? (
                <div className="flex justify-between items-center mt-2 mb-1 text-sm">
                  <span className="text-gray-500 font-medium">
                    {record.isLeave ? record.notes : 'OFF-DAY'}
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    record.isLeave ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {record.isLeave ? record.notes : 'OFF-DAY'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <span className="text-xs text-gray-500">Check In</span>
                      <div className="text-sm mt-1 text-gray-700 font-bold">
                        {record.display_check_in || 'Missing'}
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-xs text-gray-500">Check Out</span>
                      <div className="text-sm mt-1 text-gray-700 font-bold">
                        {record.display_check_out || 'Missing'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {record.shiftType && (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        record.shiftType === 'morning' ? 'bg-blue-100 text-blue-800' : 
                        record.shiftType === 'evening' ? 'bg-orange-100 text-orange-800' : 
                        record.shiftType === 'night' ? 'bg-purple-100 text-purple-800' :
                        record.shiftType === 'canteen' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {record.shiftType.charAt(0).toUpperCase() + record.shiftType.slice(1)}
                      </span>
                    )}
                    
                    {/* Record count badge */}
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                      {record.recordCount || 0} record{record.recordCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </>
              )}
              
              {(record.checkIn?.notes || record.checkOut?.notes) && !record.isOffDay && !record.isLeave && (
                <div className="mt-2 text-xs text-gray-600 text-break-word">
                  {(record.checkIn?.notes || record.checkOut?.notes || '').replace(/hours:\d+\.\d+;?\s*/, '')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // Desktop Table View
  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <Clock className="w-4 h-4 text-gray-500 mr-2" />
          {title}
        </h3>
      </div>
      
      <div className="overflow-x-auto mobile-table">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Employee
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Check In
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Check Out
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Shift Type
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Notes
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hours
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {processedRecords.map((record, index) => (
              <tr key={index} className={`hover:bg-gray-50 ${
                record.isOffDay ? 'bg-gray-50' : (record.isLeave ? 'bg-blue-50' : '')
              }`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {format(new Date(record.date), 'EEE, MMM d, yyyy')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div>
                    <div className="font-medium">{record.employeeName}</div>
                    <div className="text-xs text-gray-400">#{record.employeeNumber}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {record.isOffDay || record.isLeave ? (
                    <span className="text-gray-400">
                      {record.isLeave ? record.notes : 'OFF-DAY'}
                    </span>
                  ) : (
                    <div className="text-gray-600 font-bold">
                      {record.display_check_in || 'Missing'}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {record.isOffDay || record.isLeave ? (
                    <span className="text-gray-400">
                      {record.isLeave ? record.notes : 'OFF-DAY'}
                    </span>
                  ) : (
                    <div className="text-gray-600 font-bold">
                      {record.display_check_out || 'Missing'}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {record.isOffDay || record.isLeave ? (
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      record.isLeave ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {record.isLeave ? 'Leave' : 'OFF-DAY'}
                    </span>
                  ) : (
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      record.shiftType === 'morning' ? 'bg-blue-100 text-blue-800' : 
                      record.shiftType === 'evening' ? 'bg-orange-100 text-orange-800' : 
                      record.shiftType === 'night' ? 'bg-purple-100 text-purple-800' :
                      record.shiftType === 'canteen' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {record.shiftType.charAt(0).toUpperCase() + record.shiftType.slice(1)}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 mobile-wrap">
                  {record.isOffDay ? (
                    <span className="text-gray-500">OFF-DAY</span>
                  ) : record.isLeave ? (
                    <span className="text-gray-500">{record.notes}</span>
                  ) : (record.checkIn?.notes || record.checkOut?.notes) ? (
                    <div className="max-w-[250px] text-break-word">
                      {(record.checkIn?.notes || record.checkOut?.notes || '').replace(/hours:\d+\.\d+;?\s*/, '')}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {record.isOffDay ? (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      0.00 hours
                    </span>
                  ) : record.isLeave ? (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      9.00 hours
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      9.00 hours
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimeRecordsTable;