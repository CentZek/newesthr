/**
 * Time record helper functions for applying changes to daily records
 */
import { EmployeeRecord, DailyRecord, DISPLAY_SHIFT_TIMES } from '../types';
import { calculatePayableHours, determineShiftType } from './shiftCalculations';
import { parse, format, eachDayOfInterval, parseISO } from 'date-fns';
import { parseShiftTimes } from './dateTimeHelper';

// Handle adding a manual entry to the employee records
export const addManualEntryToRecords = (
  recordData: any,
  employeeRecords: EmployeeRecord[],
): {
  updatedRecords: EmployeeRecord[];
  employeeIndex: number;
  isNewEmployee: boolean;
} => {
  const { employee, date, checkIn, checkOut, shiftType, checkInDate, checkOutDate, entryType, leaveType } = recordData;
  
  if (!employee || !date) {
    throw new Error("Missing required data for manual entry");
  }
  
  // Use provided date objects if available, otherwise parse from strings
  let firstCheckIn: Date | null;
  let lastCheckOut: Date | null;
  
  if (checkInDate) {
    firstCheckIn = checkInDate;
  } else if (checkIn) {
    const { checkIn: parsedCheckIn } = parseShiftTimes(date, checkIn, checkOut || '00:00', shiftType);
    firstCheckIn = parsedCheckIn;
  } else {
    // For manual entries, create a proper timestamp based on shift type
    if (entryType === 'shift') {
      // Create proper timestamp based on shift type and date
      const hourMap: Record<string, string> = {
        'morning': '05:00',
        'evening': '13:00',
        'night': '21:00',
        'canteen': '07:00'
      };
      const timeStr = hourMap[shiftType as string] || '08:00';
      firstCheckIn = parse(`${date} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date());
    } else {
      firstCheckIn = null;
    }
  }
  
  if (checkOutDate) {
    lastCheckOut = checkOutDate;
  } else if (checkOut) {
    const { checkOut: parsedCheckOut } = parseShiftTimes(date, checkIn || '00:00', checkOut, shiftType);
    lastCheckOut = parsedCheckOut;
  } else {
    // For manual entries, create a proper timestamp based on shift type
    if (entryType === 'shift') {
      // Create proper timestamp based on shift type and date
      const hourMap: Record<string, string> = {
        'morning': '14:00',
        'evening': '22:00',
        'night': '06:00',
        'canteen': '16:00'
      };
      const timeStr = hourMap[shiftType as string] || '17:00';
      
      // For night shift, checkout is next day
      if (shiftType === 'night') {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = format(nextDay, 'yyyy-MM-dd');
        lastCheckOut = parse(`${nextDayStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date());
      } else {
        lastCheckOut = parse(`${date} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date());
      }
    } else {
      lastCheckOut = null;
    }
  }
  
  // Create dummy time records for the raw data view
  const allTimeRecords = [];
  if (firstCheckIn) {
    allTimeRecords.push({
      timestamp: firstCheckIn,
      status: 'check_in',
      shift_type: shiftType,
      notes: 'Manual entry',
      originalIndex: 0
    });
  }
  
  if (lastCheckOut) {
    allTimeRecords.push({
      timestamp: lastCheckOut,
      status: 'check_out',
      shift_type: shiftType,
      notes: 'Manual entry',
      originalIndex: 1
    });
  }
  
  // Get standard display times based on shift type
  const getStandardDisplayTime = (type: string, timeType: 'start' | 'end') => {
    const displayTimes = {
      morning: { startTime: '05:00', endTime: '14:00' },
      evening: { startTime: '13:00', endTime: '22:00' },
      night: { startTime: '21:00', endTime: '06:00' },
      canteen: { startTime: '07:00', endTime: '16:00' }, // Default to early canteen
      off_day: { startTime: 'OFF-DAY', endTime: 'OFF-DAY' }
    };
    
    if (!type || !displayTimes[type as keyof typeof displayTimes]) return '';
    
    return timeType === 'start' ? 
      displayTimes[type as keyof typeof displayTimes].startTime : 
      displayTimes[type as keyof typeof displayTimes].endTime;
  };

  // For leaves, use the leave type as the display value
  const getLeaveDisplayValue = (leaveTypeValue: string | undefined) => {
    return leaveTypeValue || 'annual-leave';
  };
  
  // Determine what kind of record to create based on entryType if provided
  const isOffDay = entryType === 'off-day' || recordData.shiftType === 'off_day';
  const isLeave = entryType === 'leave' || (leaveType && leaveType.includes('leave'));
  
  let dailyRecordType = 'shift';
  if (isOffDay) {
    dailyRecordType = 'off-day';
  } else if (isLeave) {
    dailyRecordType = 'leave';
  } else {
    dailyRecordType = 'shift';
  }
  
  let hoursWorked = 9.0; // Standard for shifts and leave days
  let actualShiftType = shiftType;
  let notesValue = '';
  let displayCheckInValue = '';
  let displayCheckOutValue = '';
  
  // Set values based on record type
  if (dailyRecordType === 'off-day') {
    hoursWorked = 0.0;
    actualShiftType = 'off_day';
    notesValue = 'OFF-DAY';
    displayCheckInValue = 'OFF-DAY';
    displayCheckOutValue = 'OFF-DAY';
  } else if (dailyRecordType === 'leave') {
    hoursWorked = 9.0; // Leave days get 9 hours
    actualShiftType = 'off_day'; // Store as off_day type
    notesValue = leaveType || 'annual-leave';
    displayCheckInValue = leaveType || 'annual-leave';
    displayCheckOutValue = leaveType || 'annual-leave';
  } else {
    // For regular shifts
    hoursWorked = 9.0;
    actualShiftType = shiftType;
    notesValue = 'Manual entry';
    displayCheckInValue = getStandardDisplayTime(shiftType, 'start');
    displayCheckOutValue = getStandardDisplayTime(shiftType, 'end');
  }
  
  // Create daily record
  const newDay: DailyRecord = {
    date,
    firstCheckIn: firstCheckIn,
    lastCheckOut: lastCheckOut,
    hoursWorked,
    approved: false, // Start as pending, not auto-approved
    shiftType: actualShiftType,
    notes: notesValue,
    missingCheckIn: !firstCheckIn,
    missingCheckOut: !lastCheckOut,
    isLate: false,
    earlyLeave: false,
    excessiveOvertime: false,
    penaltyMinutes: 0,
    allTimeRecords: allTimeRecords,
    hasMultipleRecords: allTimeRecords.length > 0,
    isCrossDay: shiftType === 'night',
    checkOutNextDay: shiftType === 'night',
    // Add display values for consistent viewing
    displayCheckIn: displayCheckInValue,
    displayCheckOut: displayCheckOutValue,
    // Add working_week_start for consistent grouping
    working_week_start: date
  };
  
  // Get normalized employee info for matching
  const empNumber = String(employee.employee_number || employee.employeeNumber || "").trim();
  const empName = employee.name || "";

  // Find employee by number or name
  let employeeIndex = -1;
  
  for (let i = 0; i < employeeRecords.length; i++) {
    const emp = employeeRecords[i];
    
    // Try exact match on employee number
    if (String(emp.employeeNumber).trim() === empNumber) {
      employeeIndex = i;
      break;
    }
    
    // If no match by number, try matching by name
    if (emp.name.toLowerCase() === empName.toLowerCase()) {
      employeeIndex = i;
      break;
    }
  }
  
  // Create copy of records to modify
  const newRecords = [...employeeRecords];
  let isNewEmployee = false;
  
  if (employeeIndex >= 0) {
    // Employee exists, add or update day
    const existingDayIndex = newRecords[employeeIndex].days.findIndex(
      d => d.date === date
    );
    
    if (existingDayIndex >= 0) {
      // Update existing day
      newRecords[employeeIndex].days[existingDayIndex] = newDay;
    } else {
      // Add new day
      newRecords[employeeIndex].days.push(newDay);
      newRecords[employeeIndex].totalDays += 1;
    }
    
    // Sort days by date
    newRecords[employeeIndex].days.sort((a, b) => a.date.localeCompare(b.date));
    
    // Sort days by date
    newRecords[employeeIndex].days.sort((a, b) => a.date.localeCompare(b.date));
    
    newRecords[employeeIndex].expanded = true; // Auto-expand to show the new entry
  } else {
    // Employee doesn't exist in current records, create a new entry
    isNewEmployee = true;
    newRecords.push({
      employeeNumber: empNumber,
      name: empName,
      department: '',
      days: [newDay],
      totalDays: 1,
      expanded: true // Auto-expand to show the new entry
    });
    employeeIndex = newRecords.length - 1;
  }
  
  return { 
    updatedRecords: newRecords,
    employeeIndex,
    isNewEmployee
  };
};

// Calculate updated statistics after data modification
export const calculateStats = (employeeRecords: EmployeeRecord[]) => {
  const totalEmployees = employeeRecords.length;
  let totalDays = 0;
  
  employeeRecords.forEach(emp => {
    totalDays += emp.days.length;
  });
  
  return { totalEmployees, totalDays };
};

// Process employee record updates after saving to database
export const processRecordsAfterSave = (employeeRecords: EmployeeRecord[]) => {
  const updatedRecords = employeeRecords
    .map(emp => ({
      ...emp,
      days: emp.days.filter(d => !d.approved) // Remove approved days
    }))
    .filter(emp => emp.days.length > 0); // Remove employees with no remaining days
    
  return updatedRecords;
};

// Add OFF-DAY markers for any missing days in the date range
export const addOffDaysToRecords = (employeeRecords: EmployeeRecord[]): EmployeeRecord[] => {
  return employeeRecords.map(employee => {
    // Skip if no days or only one day
    if (employee.days.length <= 1) return employee;
    
    // Sort days by date
    const sortedDays = [...employee.days].sort((a, b) => a.date.localeCompare(b.date));
    
    // Find earliest and latest dates
    const earliestDate = new Date(sortedDays[0].date);
    const latestDate = new Date(sortedDays[sortedDays.length - 1].date);
    
    // Get all dates in the range
    const dateRange = eachDayOfInterval({ start: earliestDate, end: latestDate });
    const existingDates = new Set(sortedDays.map(day => day.date));
    
    // Create OFF-DAY entries for missing dates
    const offDays: DailyRecord[] = [];
    
    dateRange.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (!existingDates.has(dateStr)) {
        offDays.push(createOffDayRecord(dateStr));
      }
    });
    
    // Add OFF-DAYs to the employee record
    const updatedDays = [...sortedDays, ...offDays].sort((a, b) => a.date.localeCompare(b.date));
    
    return {
      ...employee,
      days: updatedDays,
      totalDays: updatedDays.length
    };
  });
};

// Helper function to create an OFF-DAY record
export const createOffDayRecord = (dateStr: string): DailyRecord => {
  return {
    date: dateStr,
    firstCheckIn: null,
    lastCheckOut: null,
    hoursWorked: 0,
    approved: false,
    shiftType: 'off_day',
    notes: 'OFF-DAY',
    missingCheckIn: true,
    missingCheckOut: true,
    isLate: false,
    earlyLeave: false,
    excessiveOvertime: false,
    penaltyMinutes: 0,
    allTimeRecords: [],
    hasMultipleRecords: false,
    displayCheckIn: 'OFF-DAY',
    displayCheckOut: 'OFF-DAY',
    working_week_start: dateStr
  };
};

// Helper function to create a LEAVE record
export const createLeaveRecord = (dateStr: string, leaveType: string): DailyRecord => {
  return {
    date: dateStr,
    firstCheckIn: null,
    lastCheckOut: null,
    hoursWorked: 9.0, // Leave days get 9.0 hours
    approved: false,
    shiftType: 'off_day', // Using off_day type for leave as well
    notes: leaveType,
    missingCheckIn: true,
    missingCheckOut: true,
    isLate: false,
    earlyLeave: false,
    excessiveOvertime: false,
    penaltyMinutes: 0,
    allTimeRecords: [],
    hasMultipleRecords: false,
    displayCheckIn: leaveType,
    displayCheckOut: leaveType,
    working_week_start: dateStr
  };
};

// Fetch employee shift requests and convert to EmployeeRecord format
export const convertShiftRequestsToRecords = async () => {
  try {
    const { data: pendingShifts, error } = await fetch('/api/pending-shifts')
      .then(res => res.json());
    
    if (error) throw error;
    
    const employeeMap = new Map();
    
    // Group shifts by employee
    pendingShifts.forEach(shift => {
      if (!employeeMap.has(shift.employee_id)) {
        employeeMap.set(shift.employee_id, {
          employeeNumber: shift.employee_number,
          name: shift.employee_name,
          department: '',
          days: [],
          totalDays: 0,
          expanded: false
        });
      }
      
      const emp = employeeMap.get(shift.employee_id);
      
      // Use our helper function to properly handle night shifts
      const { checkIn, checkOut } = parseShiftTimes(
        shift.date,
        shift.start_time,
        shift.end_time,
        shift.shift_type
      );
      
      const hoursWorked = calculatePayableHours(checkIn, checkOut, shift.shift_type);
      
      // Get standard display times based on shift type
      const getStandardDisplayTime = (shiftType: string, timeType: 'start' | 'end') => {
        const displayTimes = {
          morning: { startTime: '05:00', endTime: '14:00' },
          evening: { startTime: '13:00', endTime: '22:00' },
          night: { startTime: '21:00', endTime: '06:00' },
          canteen: { startTime: '07:00', endTime: '16:00' }
        };
        
        if (!displayTimes[shiftType as keyof typeof displayTimes]) return '';
        
        return timeType === 'start' ? 
          displayTimes[shiftType as keyof typeof displayTimes].startTime : 
          displayTimes[shiftType as keyof typeof displayTimes].endTime;
      };
      
      emp.days.push({
        date: shift.date,
        firstCheckIn: checkIn,
        lastCheckOut: checkOut,
        hoursWorked,
        approved: false,
        shiftType: shift.shift_type,
        notes: shift.notes || 'Employee submitted shift',
        missingCheckIn: false,
        missingCheckOut: false,
        isLate: false,
        earlyLeave: false,
        excessiveOvertime: false,
        penaltyMinutes: 0,
        displayCheckIn: getStandardDisplayTime(shift.shift_type, 'start'),
        displayCheckOut: getStandardDisplayTime(shift.shift_type, 'end'),
        working_week_start: shift.date
      });
      
      emp.totalDays++;
    });
    
    return Array.from(employeeMap.values());
  } catch (error) {
    console.error('Error converting shift requests to records:', error);
    return [];
  }
};