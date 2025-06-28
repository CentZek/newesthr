import React, { useState, useEffect } from 'react';
import { format, addDays, differenceInDays, parseISO, isValid, eachDayOfInterval } from 'date-fns';
import { X, Clock, User, Calendar, Check, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { SHIFT_TIMES, DISPLAY_SHIFT_TIMES } from '../types';
import { parseShiftTimes } from '../utils/dateTimeHelper';
import { fetchManualTimeRecords, checkExistingTimeRecord, safeUpsertTimeRecord } from '../services/database';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: any) => void;
}

const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave 
}) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeShiftRequests, setEmployeeShiftRequests] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  
  // Form state
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [shiftType, setShiftType] = useState<'morning' | 'evening' | 'night' | 'canteen'>('morning');
  const [notes, setNotes] = useState<string>('');
  const [createNewEmployee, setCreateNewEmployee] = useState<boolean>(false);
  const [newEmployeeName, setNewEmployeeName] = useState<string>('');
  const [newEmployeeNumber, setNewEmployeeNumber] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [entryType, setEntryType] = useState<'shift' | 'leave' | 'off-day'>('shift');
  const [leaveType, setLeaveType] = useState<string>('annual-leave');

  // Helper function to check if a date string is valid
  const isValidDateString = (dateString: string): boolean => {
    if (!dateString || dateString.trim() === '') return false;
    return isValid(parseISO(dateString));
  };

  // Reset and initialize form when opening
  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
      fetchEmployeeShiftRequests();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setSelectedEmployee('');
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
    setShiftType('morning');
    setNotes('');
    setCreateNewEmployee(false);
    setNewEmployeeName('');
    setNewEmployeeNumber('');
    setErrors({});
    setEntryType('shift');
    setLeaveType('annual-leave');
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_number')
        .order('name');

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeShiftRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('employee_shifts')
        .select(`
          id, employee_id, date, shift_type, start_time, end_time, status, notes, employees(name, employee_number)
        `)
        .eq('status', 'pending')
        .order('date', { ascending: false });

      if (error) throw error;
      setEmployeeShiftRequests(data || []);
    } catch (error) {
      console.error('Error fetching employee shift requests:', error);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (entryType === 'shift') {
      if (!createNewEmployee && !selectedEmployee) {
        newErrors.employee = 'Please select an employee';
      }

      if (createNewEmployee) {
        if (!newEmployeeName.trim()) newErrors.newEmployeeName = 'Employee name is required';
        if (!newEmployeeNumber.trim()) newErrors.newEmployeeNumber = 'Employee number is required';
      }

      if (!startDate) newErrors.startDate = 'Start date is required';
      if (!endDate) newErrors.endDate = 'End date is required';
      if (endDate < startDate) newErrors.endDate = 'End date cannot be before start date';
    } else if (entryType === 'leave') {
      if (!createNewEmployee && !selectedEmployee) {
        newErrors.employee = 'Please select an employee';
      }

      if (createNewEmployee) {
        if (!newEmployeeName.trim()) newErrors.newEmployeeName = 'Employee name is required';
        if (!newEmployeeNumber.trim()) newErrors.newEmployeeNumber = 'Employee number is required';
      }

      if (!startDate) newErrors.startDate = 'Start date is required';
      if (!endDate) newErrors.endDate = 'End date is required';
      if (endDate < startDate) newErrors.endDate = 'End date cannot be before start date';
      if (!leaveType) newErrors.leaveType = 'Please select a leave type';
    } else if (entryType === 'off-day') {
      if (!createNewEmployee && !selectedEmployee) {
        newErrors.employee = 'Please select an employee';
      }

      if (createNewEmployee) {
        if (!newEmployeeName.trim()) newErrors.newEmployeeName = 'Employee name is required';
        if (!newEmployeeNumber.trim()) newErrors.newEmployeeNumber = 'Employee number is required';
      }

      if (!startDate) newErrors.startDate = 'Start date is required';
      if (!endDate) newErrors.endDate = 'End date is required';
      if (endDate < startDate) newErrors.endDate = 'End date cannot be before start date';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getStandardShiftTimes = (type: 'morning' | 'evening' | 'night' | 'canteen') => {
    return {
      start: type === 'morning' ? '05:00' : type === 'evening' ? '13:00' : type === 'night' ? '21:00' : '07:00',
      end: type === 'morning' ? '14:00' : type === 'evening' ? '22:00' : type === 'night' ? '06:00' : '16:00',
    };
  };

  const handleApproveShift = async (shift: any) => {
    setIsProcessing(prev => ({ ...prev, [shift.id]: true }));
    try {
      // First check if there are existing time records for this employee on this date
      const { data: existingRecords, error: checkError } = await supabase
        .from('time_records')
        .select('id, status')
        .eq('employee_id', shift.employee_id)
        .eq('working_week_start', shift.date);
        
      if (checkError) throw checkError;
      
      // Delete any existing records for this date and working_week_start
      if (existingRecords && existingRecords.length > 0) {
        console.log(`Deleting ${existingRecords.length} existing records for date ${shift.date}`);
        const recordIds = existingRecords.map(record => record.id);
        const { error: deleteError } = await supabase
          .from('time_records')
          .delete()
          .in('id', recordIds);
          
        if (deleteError) throw deleteError;
      }
      
      // Update the shift status to confirmed
      const { error: updateError } = await supabase
        .from('employee_shifts')
        .update({ status: 'confirmed' })
        .eq('id', shift.id);
        
      if (updateError) throw updateError;
      
      // Parse shift times - get proper Date objects for check-in and check-out
      const { checkIn, checkOut } = parseShiftTimes(
        shift.date,
        shift.shift_type === 'morning' ? '05:00' : shift.shift_type === 'evening' ? '13:00' : '21:00',
        shift.shift_type === 'morning' ? '14:00' : shift.shift_type === 'evening' ? '22:00' : '06:00',
        shift.shift_type
      );
      
      // Format dates using date-fns to ensure consistent timezone handling
      const checkInTimestamp = format(checkIn, "yyyy-MM-dd'T'HH:mm:ss");
      const checkOutTimestamp = format(checkOut, "yyyy-MM-dd'T'HH:mm:ss");
      
      // Calculate hours worked for consistency
      const hoursWorked = 9.0; // Standard hours for all shift types
      const hoursNote = `hours:${hoursWorked.toFixed(2)}`;

      // Get standard display times for check-in and check-out based on shift type
      const displayTimes = DISPLAY_SHIFT_TIMES[shift.shift_type as keyof typeof DISPLAY_SHIFT_TIMES];
      const displayCheckIn = displayTimes?.startTime || shift.start_time;
      const displayCheckOut = displayTimes?.endTime || shift.end_time;

      // Prepare the check-in record
      const checkInRecord = {
        employee_id: shift.employee_id,
        timestamp: checkInTimestamp,
        status: 'check_in',
        shift_type: shift.shift_type,
        notes: `Employee submitted shift - HR approved; ${hoursNote}`,
        is_manual_entry: true,
        exact_hours: hoursWorked,
        is_late: false,
        early_leave: false,
        deduction_minutes: 0,
        display_check_in: displayCheckIn,
        display_check_out: displayCheckOut,
        working_week_start: shift.date // Set working_week_start for proper grouping
      };

      // Prepare the check-out record
      const checkOutRecord = {
        employee_id: shift.employee_id,
        timestamp: checkOutTimestamp,
        status: 'check_out',
        shift_type: shift.shift_type,
        notes: `Employee submitted shift - HR approved; ${hoursNote}`,
        is_manual_entry: true,
        exact_hours: hoursWorked,
        is_late: false,
        early_leave: false,
        deduction_minutes: 0,
        display_check_in: displayCheckIn,
        display_check_out: displayCheckOut,
        working_week_start: shift.date // Same working_week_start for both records
      };

      // Insert both records together to maintain atomicity
      const { error: insertError } = await supabase
        .from('time_records')
        .insert([checkInRecord, checkOutRecord]);
        
      if (insertError) throw insertError;
      
      // Remove the shift from the list
      setEmployeeShiftRequests(prev => prev.filter(s => s.id !== shift.id));
      
      // Get fresh records from the database
      const freshRecords = await fetchManualTimeRecords(50);
      
      // Call callback if provided
      if (onSave) {
        const employeeData = {
          id: shift.employee_id,
          name: shift.employees.name,
          employeeNumber: shift.employees.employee_number,
          employee_number: shift.employees.employee_number
        };
        
        onSave({
          employee: employeeData,
          date: shift.date,
          shiftType: shift.shift_type,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          hoursWorked
        });
      }
      
      toast.success(`Approved shift for ${shift.employees.name}`);
    } catch (error) {
      console.error('Error approving employee shift:', error);
      toast.error('Failed to approve shift');
    } finally {
      setIsProcessing(prev => ({ ...prev, [shift.id]: false }));
    }
  };

  const getShiftTimes = (shiftType: string, dateStr: string) => {
    let startTime, endTime, checkOutDate = dateStr;
    
    if (shiftType === 'morning') {
      startTime = '05:00';
      endTime = '14:00';
    } else if (shiftType === 'evening') {
      startTime = '13:00';
      endTime = '22:00';
    } else if (shiftType === 'night') {
      startTime = '21:00';
      const nextDay = new Date(dateStr);
      nextDay.setDate(nextDay.getDate() + 1);
      checkOutDate = format(nextDay, 'yyyy-MM-dd');
      endTime = '06:00';
    } else if (shiftType === 'canteen') {
      startTime = '07:00';
      endTime = '16:00';
    }
    
    return { startTime, endTime, checkOutDate };
  };

  const handleRejectShift = async (shiftId: string, employeeName: string) => {
    setIsProcessing(prev => ({ ...prev, [shiftId]: true }));
    try {
      const { error } = await supabase
        .from('employee_shifts')
        .update({ status: 'rejected' })
        .eq('id', shiftId);
        
      if (error) throw error;
      setEmployeeShiftRequests(prev => prev.filter(s => s.id !== shiftId));
      toast.success(`Rejected shift for ${employeeName}`);
    } catch (error) {
      console.error('Error rejecting employee shift:', error);
      toast.error('Failed to reject shift');
    } finally {
      setIsProcessing(prev => ({ ...prev, [shiftId]: false }));
    }
  };

  // Create a single record for the given date
  const createRecordForDate = async (date: string, employeeId: string, employeeData: any) => {
    try {
      if (entryType === 'off-day') {
        // For OFF-days
        const offDayData = {
          employee_id: employeeId,
          timestamp: `${date}T12:00:00`,
          status: 'off_day',
          shift_type: 'off_day',
          notes: 'OFF-DAY',
          is_manual_entry: true,
          exact_hours: 0,
          working_week_start: date,
          display_check_in: 'OFF-DAY',
          display_check_out: 'OFF-DAY',
          approved: true
        };

        // Check if an OFF-DAY record already exists
        const existingOffDayId = await checkExistingTimeRecord(
          employeeId,
          'off_day',
          'off_day',
          date
        );

        await safeUpsertTimeRecord(offDayData, existingOffDayId);
      } else if (entryType === 'leave') {
        // For Leaves
        const leaveData = {
          employee_id: employeeId,
          timestamp: `${date}T12:00:00`,
          status: 'off_day',
          shift_type: 'off_day',
          notes: leaveType,
          is_manual_entry: true,
          exact_hours: 9.0, // Leave days get 9 hours credit
          working_week_start: date,
          display_check_in: leaveType,
          display_check_out: leaveType,
          approved: true
        };

        // Check if a leave record already exists
        const existingLeaveId = await checkExistingTimeRecord(
          employeeId,
          'off_day',
          'off_day',
          date
        );

        await safeUpsertTimeRecord(leaveData, existingLeaveId);
      } else {
        // For normal shifts - do NOT create employee_shifts record for manual entries
        // Manual entries go directly to time_records with approved status
        
        // Get standard times for selected shift
        const { startTime, endTime, checkOutDate } = getShiftTimes(shiftType, date);

        // Use our helper function to properly handle day rollover
        const { checkIn, checkOut } = parseShiftTimes(
          date, 
          startTime, 
          endTime, 
          shiftType
        );

        // Format dates properly
        const checkInTimestamp = format(checkIn, "yyyy-MM-dd'T'HH:mm:ss");
        const checkOutTimestamp = format(checkOut, "yyyy-MM-dd'T'HH:mm:ss");

        // Get display times
        const displayTimes = DISPLAY_SHIFT_TIMES[shiftType];
        const displayCheckIn = displayTimes.startTime;
        const displayCheckOut = displayTimes.endTime;
        
        // Prepare time records for check-in
        const checkInData = {
          employee_id: employeeId,
          timestamp: checkInTimestamp,
          status: 'check_in',
          shift_type: shiftType,
          notes: notes || 'Manual entry; hours:9.00',
          is_manual_entry: true,
          working_week_start: date, // Set working_week_start for proper grouping
          display_check_in: displayCheckIn,
          display_check_out: displayCheckOut,
          exact_hours: 9.0,
          approved: true
        };
        
        // Prepare time records for check-out
        const checkOutData = {
          employee_id: employeeId,
          timestamp: checkOutTimestamp,
          status: 'check_out',
          shift_type: shiftType,
          notes: notes || 'Manual entry; hours:9.00',
          is_manual_entry: true,
          working_week_start: shiftType === 'night' && checkOut.getHours() < 12 ? 
            date : // For night shifts, use check-in date
            date,  // For other shifts, use current date
          display_check_in: displayCheckIn,
          display_check_out: displayCheckOut,
          exact_hours: 9.0,
          approved: true
        };

        // Check if records already exist and update or insert accordingly
        // First check for existing check-in record
        const existingCheckInId = await checkExistingTimeRecord(
          employeeId, 
          shiftType,
          'check_in',
          date
        );
        
        // Then check for existing check-out record
        const existingCheckOutId = await checkExistingTimeRecord(
          employeeId, 
          shiftType,
          'check_out',
          date
        );
        
        // Use safeUpsertTimeRecord to handle both insert and update
        const checkInSuccess = await safeUpsertTimeRecord(checkInData, existingCheckInId);
        if (!checkInSuccess) throw new Error('Failed to save check-in record');
        
        const checkOutSuccess = await safeUpsertTimeRecord(checkOutData, existingCheckOutId);
        if (!checkOutSuccess) throw new Error('Failed to save check-out record');
      }

      return {
        employee: employeeData,
        date: date,
        entryType: entryType,
        shiftType: entryType === 'shift' ? shiftType : (entryType === 'leave' ? leaveType : 'off_day')
      };
    } catch (error) {
      console.error(`Error creating record for date ${date}:`, error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      let employeeId = selectedEmployee;
      let employeeData = employees.find(e => e.id === selectedEmployee);

      // Create new employee if needed
      if (createNewEmployee) {
        const { data: newEmployee, error: createError } = await supabase
          .from('employees')
          .insert({
            name: newEmployeeName.trim(),
            employee_number: newEmployeeNumber.trim()
          })
          .select();

        if (createError) throw createError;

        if (newEmployee && newEmployee.length > 0) {
          employeeId = newEmployee[0].id;
          employeeData = {
            id: newEmployee[0].id,
            name: newEmployeeName.trim(),
            employee_number: newEmployeeNumber.trim()
          };
          
          // Create credentials for the new employee
          await supabase
            .from('user_credentials')
            .insert({
              employee_id: employeeId,
              username: `${newEmployeeName.trim()}_${newEmployeeNumber.trim()}`,
              password: newEmployeeNumber.trim()
            });
        } else {
          throw new Error('Failed to create new employee');
        }
      }

      // Calculate all dates in the selected range
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);
      
      if (!isValid(startDateObj) || !isValid(endDateObj)) {
        throw new Error('Invalid date format');
      }
      
      // Get all days in the date range
      const days = eachDayOfInterval({
        start: startDateObj,
        end: endDateObj
      });
      
      const results = [];
      
      // Create records for each day in the range
      for (const day of days) {
        const currentDate = format(day, 'yyyy-MM-dd');
        
        const result = await createRecordForDate(currentDate, employeeId, {
          ...employeeData,
          employeeNumber: employeeData?.employee_number
        });
        
        results.push(result);
      }

      // Fetch fresh records from the database
      const freshRecords = await fetchManualTimeRecords(50);

      // Call the save callback with each result
      for (const result of results) {
        onSave(result);
      }

      toast.success(`Successfully added records for ${days.length} day(s)`);
      onClose(); // Close the modal after successful save

    } catch (error) {
      console.error('Error saving manual time record:', error);
      setErrors({ submit: 'Failed to save time record. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 overflow-auto h-[90vh] max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-blue-600 text-white">
          <h3 className="text-lg font-semibold flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Add Manual Time Record
          </h3>
          <button onClick={onClose} className="text-white hover:text-blue-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-100 rounded-md p-4 flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">Add missing time records</p>
              <p>Use this form to manually add time records for employees who forgot to clock in or out.</p>
              <p className="mt-1">You can now add records for multiple days at once, as well as leaves and off-days.</p>
            </div>
          </div>

          {/* Record Type Selection */}
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <h4 className="font-medium text-gray-800">Record Type</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                className={`border rounded-md p-3 flex flex-col items-center cursor-pointer transition-colors ${
                  entryType === 'shift' 
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setEntryType('shift')}
              >
                <div className="flex items-center mb-1">
                  <div className={`h-4 w-4 rounded-full ${
                    entryType === 'shift' ? 'bg-blue-500' : 'border border-gray-300'
                  }`}>
                    {entryType === 'shift' && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="ml-2 text-sm font-medium capitalize">
                    Work Shift
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  Regular shift hours (Morning, Evening, Night, Canteen)
                </span>
              </div>
              
              <div
                className={`border rounded-md p-3 flex flex-col items-center cursor-pointer ${
                  entryType === 'leave' ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setEntryType('leave')}
              >
                <div className="flex items-center mb-1">
                  <div className={`h-4 w-4 rounded-full ${
                    entryType === 'leave' ? 'bg-green-500' : 'border border-gray-300'
                  }`}>
                    {entryType === 'leave' && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="ml-2 text-sm font-medium">Leave</span>
                </div>
                <span className="text-xs text-gray-500">
                  Paid leave (Annual, Sick, etc.) - 9 hours credit
                </span>
              </div>
              
              <div
                className={`border rounded-md p-3 flex flex-col items-center cursor-pointer ${
                  entryType === 'off-day' ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setEntryType('off-day')}
              >
                <div className="flex items-center mb-1">
                  <div className={`h-4 w-4 rounded-full ${
                    entryType === 'off-day' ? 'bg-red-500' : 'border border-gray-300'
                  }`}>
                    {entryType === 'off-day' && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="ml-2 text-sm font-medium">OFF-DAY</span>
                </div>
                <span className="text-xs text-gray-500">
                  Unpaid day off - 0 hours credit
                </span>
              </div>
            </div>
          </div>

          {/* Employee Selection */}
          <div className="space-y-4">
            <div className="flex items-center mb-2">
              <input
                type="radio"
                id="existing-employee"
                checked={!createNewEmployee}
                onChange={() => setCreateNewEmployee(false)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="existing-employee" className="ml-2 block text-sm font-medium text-gray-700">
                Select Existing Employee
              </label>
            </div>
            
            {!createNewEmployee && (
              <div className="pl-6">
                <label htmlFor="employee" className="block text-sm font-medium text-gray-700 mb-1">
                  Employee
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    id="employee"
                    value={selectedEmployee}
                    onChange={(e) => {
                      setSelectedEmployee(e.target.value);
                      setErrors({ ...errors, employee: '' });
                    }}
                    className={`block w-full pl-10 pr-3 py-2 text-base border ${
                      errors.employee ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 
                      'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                    } rounded-md`}
                    disabled={loading}
                  >
                    <option value="">Select an employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} (#{employee.employee_number})
                      </option>
                    ))}
                  </select>
                </div>
                {errors.employee && <p className="mt-1 text-xs text-red-600">{errors.employee}</p>}
              </div>
            )}

            <div className="flex items-center mb-2">
              <input
                type="radio"
                id="new-employee"
                checked={createNewEmployee}
                onChange={() => setCreateNewEmployee(true)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="new-employee" className="ml-2 block text-sm font-medium text-gray-700">
                Create New Employee
              </label>
            </div>
            
            {createNewEmployee && (
              <div className="pl-6 space-y-4">
                <div>
                  <label htmlFor="new-employee-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Employee Name
                  </label>
                  <input
                    type="text"
                    id="new-employee-name"
                    value={newEmployeeName}
                    onChange={(e) => {
                      setNewEmployeeName(e.target.value);
                      setErrors({ ...errors, newEmployeeName: '' });
                    }}
                    className={`block w-full px-3 py-2 border ${
                      errors.newEmployeeName ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 
                      'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                    } rounded-md`}
                    placeholder="Full name"
                  />
                  {errors.newEmployeeName && <p className="mt-1 text-xs text-red-600">{errors.newEmployeeName}</p>}
                </div>
                
                <div>
                  <label htmlFor="new-employee-number" className="block text-sm font-medium text-gray-700 mb-1">
                    Employee Number
                  </label>
                  <input
                    type="text"
                    id="new-employee-number"
                    value={newEmployeeNumber}
                    onChange={(e) => {
                      setNewEmployeeNumber(e.target.value);
                      setErrors({ ...errors, newEmployeeNumber: '' });
                    }}
                    className={`block w-full px-3 py-2 border ${
                      errors.newEmployeeNumber ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 
                      'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                    } rounded-md`}
                    placeholder="Employee ID number"
                  />
                  {errors.newEmployeeNumber && <p className="mt-1 text-xs text-red-600">{errors.newEmployeeNumber}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">Date Range</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    id="start-date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setErrors({ ...errors, startDate: '' });
                      if (e.target.value > endDate) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className={`block w-full pl-10 pr-3 py-2 text-base border ${
                      errors.startDate ? 'border-red-300' : 'border-gray-300'
                    } rounded-md`}
                  />
                </div>
                {errors.startDate && <p className="mt-1 text-xs text-red-600">{errors.startDate}</p>}
              </div>

              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    id="end-date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setErrors({ ...errors, endDate: '' });
                    }}
                    className={`block w-full pl-10 pr-3 py-2 text-base border ${
                      errors.endDate ? 'border-red-300' : 'border-gray-300'
                    } rounded-md`}
                    min={startDate}
                  />
                </div>
                {errors.endDate && <p className="mt-1 text-xs text-red-600">{errors.endDate}</p>}
              </div>
            </div>
          </div>

          {/* Entry Type Specific Fields */}
          {entryType === 'shift' && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-800">Shift Details</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Shift Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['morning', 'evening', 'night', 'canteen'] as const).map((type) => (
                    <div
                      key={type}
                      className={`border rounded-md p-3 flex flex-col items-center cursor-pointer ${
                        shiftType === type ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                      }`}
                      onClick={() => setShiftType(type)}
                    >
                      <div className="flex items-center mb-1">
                        <div className={`h-4 w-4 rounded-full ${
                          shiftType === type ? 'bg-blue-500' : 'border border-gray-300'
                        }`}>
                          {shiftType === type && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className="ml-2 text-sm font-medium capitalize">{type}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {DISPLAY_SHIFT_TIMES[type].startTime} - {DISPLAY_SHIFT_TIMES[type].endTime}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-amber-600 flex items-start mt-3">
                  <AlertCircle className="w-3 h-3 mr-1 mt-1" />
                  <div>
                    <div className="font-medium">Standard shift hours will be used:</div>
                    <div className="mt-0.5">
                      {shiftType === 'morning' ? 'Morning shift: 5:00 AM - 2:00 PM' :
                       shiftType === 'evening' ? 'Evening shift: 1:00 PM - 10:00 PM' : 
                       shiftType === 'night' ? 'Night shift: 9:00 PM - 6:00 AM' :
                       'Canteen shift: 7:00 AM - 4:00 PM'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {entryType === 'leave' && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-800">Leave Details</h4>
              <div>
                <label htmlFor="leave-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Leave Type
                </label>
                <select
                  id="leave-type"
                  value={leaveType}
                  onChange={(e) => {
                    setLeaveType(e.target.value);
                    setErrors({ ...errors, leaveType: '' });
                  }}
                  className={`block w-full pl-3 pr-10 py-2 text-base border ${
                    errors.leaveType ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 
                    'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  } rounded-md`}
                >
                  <option value="annual-leave">Annual Leave</option>
                  <option value="sick-leave">Sick Leave</option>
                  <option value="marriage-leave">Marriage Leave</option>
                  <option value="bereavement-leave">Bereavement Leave</option>
                  <option value="maternity-leave">Maternity Leave</option>
                  <option value="paternity-leave">Paternity Leave</option>
                </select>
                {errors.leaveType && <p className="mt-1 text-xs text-red-600">{errors.leaveType}</p>}
                
                <div className="bg-green-50 border border-green-100 rounded-md p-3 mt-3 text-sm text-green-700 flex items-center">
                  <Info className="w-4 h-4 mr-2 flex-shrink-0 text-green-500" />
                  <p>Leave days are credited with 9 hours for payroll calculations.</p>
                </div>
              </div>
            </div>
          )}

          {entryType === 'off-day' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-md p-3 text-sm text-red-700 flex items-center">
                <Info className="w-4 h-4 mr-2 flex-shrink-0 text-red-500" />
                <p>OFF-DAYS are unpaid days with 0 hours credit. Use this for weekend days or other unpaid time off.</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              placeholder="Add any additional information about this record"
            ></textarea>
          </div>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {errors.submit}
            </div>
          )}
          
          {/* Date Range Summary - only show when both dates are valid */}
          {startDate !== endDate && isValidDateString(startDate) && isValidDateString(endDate) && (
            <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-sm">
              <p className="font-medium text-blue-700">Multiple Days Selected</p>
              <p className="text-blue-600">
                This will create {differenceInDays(parseISO(endDate), parseISO(startDate)) + 1} separate records from{' '}
                {format(parseISO(startDate), 'MMM d, yyyy')} to {format(parseISO(endDate), 'MMM d, yyyy')}.
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex flex-wrap justify-end gap-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <><span className="inline-block animate-spin h-4 w-4 border-2 border-t-transparent border-white rounded-full mr-2"></span>Saving...</>
            ) : (
              <>
                {entryType === 'shift' 
                  ? 'Save Shift Records' 
                  : entryType === 'leave' 
                    ? 'Save Leave Records' 
                    : 'Save OFF-DAY Records'
                }
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualEntryModal;