// Type definitions for the application
import { format, differenceInMinutes, differenceInHours, addDays, subDays, getDay, getHours, getMinutes, isSameDay } from 'date-fns';
import { TimeRecord, SHIFT_TIMES, LATE_TOLERANCE_MINUTES, LATE_THRESHOLDS, CANTEEN_SHIFT_HOURS } from '../types';
import { formatTime24H } from './dateTimeHelper';

// Get the expected shift start time for accurate lateness calculation
export const getExpectedShiftStartTime = (
  checkInTime: Date, 
  shiftType: 'morning' | 'evening' | 'night' | 'canteen' | 'canteen_7am' | 'canteen_8am' | 'custom'
): { hour: number; minute: number } => {
  if (shiftType === 'canteen_7am') {
    return CANTEEN_SHIFT_HOURS.early.start; // 7 AM shift
  }
  
  if (shiftType === 'canteen_8am') {
    return CANTEEN_SHIFT_HOURS.late.start; // 8 AM shift
  }
  
  if (shiftType === 'canteen') {
    // Legacy support - default to 7 AM
    return CANTEEN_SHIFT_HOURS.early.start;
  }
  
  // For other shift types, use the standard SHIFT_TIMES
  return SHIFT_TIMES[shiftType].start;
};

// Determine shift type based on check-in time
export const determineShiftType = (
  checkInTime: Date, 
  isNightShiftWorker: boolean = false
): 'morning' | 'evening' | 'night' | 'canteen' | 'custom' => {
  const hour = checkInTime.getHours();
  const minute = checkInTime.getMinutes();
  
  // CANTEEN SHIFT DETECTION - Must come first!
  // FIXED: Proper canteen shift detection with specific time ranges
  // 7 AM canteen shift: 6:00-7:30 AM check-ins
  if ((hour === 6) || (hour === 7 && minute <= 30)) {
    return 'canteen_7am';
  }
  
  // 8 AM canteen shift: 7:31-8:30 AM check-ins  
  if ((hour === 7 && minute > 30) || (hour === 8 && minute <= 30)) {
    return 'canteen_8am';
  }
  
  // Night shift: 9:00 PM - 4:29 AM
  // Check this first since it spans midnight
  if (hour >= 20 || hour < 4 || (hour === 4 && minute < 30)) {
    return 'night';
  }
  
  // Early morning check-ins are considered "morning" shift if they're after 4:30 AM
  if (hour === 4 && minute >= 30) {
    return 'morning';
  }
  
  // Morning shift: 5:00 AM - 12:59 PM
  if (hour >= 5 && hour < 12) {
    return 'morning';
  } 
  
  // Handle 12:00-12:59 time range
  if (hour === 12) {
    if (minute < 30) {
      // Before 12:30 is still considered morning shift
      return 'morning';
    } else {
      // 12:30 and after is evening shift
      return 'evening';
    }
  }
  
  // Evening shift: 1:00 PM - 8:59 PM
  if (hour >= 13 && hour < 20) {
    return 'evening';
  }
  
  // Default to evening shift if we can't determine
  return 'evening';
};

// Check if a check-in is late
export const isLateCheckIn = (checkIn: Date, shiftType: 'morning' | 'evening' | 'night' | 'canteen' | 'canteen_7am' | 'canteen_8am' | 'custom' | null): boolean => {
  if (!shiftType) return false;
  
  const hour = checkIn.getHours();
  const minute = checkIn.getMinutes();
  
  // Specific handling for canteen shifts
  if (shiftType === 'canteen_7am') {
    return hour > 7 || (hour === 7 && minute > LATE_THRESHOLDS.canteen);
  }
  
  if (shiftType === 'canteen_8am') {
    return hour > 8 || (hour === 8 && minute > LATE_THRESHOLDS.canteen);
  }
  
  if (shiftType === 'canteen') {
    // Legacy support - default to 7 AM logic
    return hour > 7 || (hour === 7 && minute > LATE_THRESHOLDS.canteen);
  }
  
  // Special handling for night shift - only consider late if more than 30 minutes past start time
  if (shiftType === 'night') {
    return (hour > SHIFT_TIMES[shiftType].start.hour || 
            (hour === SHIFT_TIMES[shiftType].start.hour && 
             minute > LATE_THRESHOLDS.night));
  }
  
  // For morning/evening shifts - any minute past the start time is considered late
  if (hour > SHIFT_TIMES[shiftType].start.hour || 
      (hour === SHIFT_TIMES[shiftType].start.hour && 
       minute > LATE_THRESHOLDS[shiftType])) {
    return true;
  }
  
  return false;
};

// Check if a check-out is an early leave
export const isEarlyLeave = (checkOut: Date, shiftType: 'morning' | 'evening' | 'night' | 'canteen' | 'canteen_7am' | 'canteen_8am' | 'custom' | null): boolean => {
  if (!shiftType) return false;
  
  const hour = checkOut.getHours();
  const minute = checkOut.getMinutes();
  
  // Specific handling for canteen shifts
  if (shiftType === 'canteen_7am') {
    return hour < 15 || (hour === 15 && minute < 30); // Before 3:30 PM is early for 7 AM shift
  }
  
  if (shiftType === 'canteen_8am') {
    return hour < 16 || (hour === 16 && minute < 30); // Before 4:30 PM is early for 8 AM shift
  }
  
  if (shiftType === 'canteen') {
    // Legacy support - default to 7 AM logic
    return hour < 15 || (hour === 15 && minute < 30);
  }
  
  // For night shifts, checkout time is typically the next day in early morning
  // So for 9:00 PM - 6:00 AM shift, early leave would be before 5:30 AM
  if (shiftType === 'night') {
    // For night shift, check-out is typically the next morning
    // So 5-6 AM is normal checkout time
    if (hour < 5 || (hour === 5 && minute < 30)) {
      // Before 5:30 AM is early
      return true;
    }
    return false;
  }
  
  // Check against early leave time from shift definitions
  const earlyLeaveHour = SHIFT_TIMES[shiftType].earlyLeaveTime.hour;
  const earlyLeaveMinute = SHIFT_TIMES[shiftType].earlyLeaveTime.minute;
  
  if (hour < earlyLeaveHour || (hour === earlyLeaveHour && minute < earlyLeaveMinute)) {
    return true;
  }
  
  return false;
};

// Calculate hours worked (raw calculation without adjustments)
export const calculateHoursWorked = (checkInTime: Date, checkOutTime: Date): number => {
  // If checkout time is earlier than check-in time, it likely means checkout was on the next day
  if (checkOutTime < checkInTime) {
    // Add 24 hours to checkout time
    const adjustedCheckOut = new Date(checkOutTime.getTime() + 24 * 60 * 60 * 1000);
    return differenceInMinutes(adjustedCheckOut, checkInTime) / 60;
  }
  
  return differenceInMinutes(checkOutTime, checkInTime) / 60;
};

// Calculate payable hours with business rules applied
export const calculatePayableHours = (
  checkInTime: Date, 
  checkOutTime: Date, 
  shiftType: 'morning' | 'evening' | 'night' | 'canteen' | 'canteen_7am' | 'canteen_8am' | 'custom' | null,
  penaltyMinutes: number = 0,
  isManualEdit: boolean = false
): number => {
  // If shift type is null, try to determine it
  if (!shiftType) {
    shiftType = determineShiftType(checkInTime);
  }
  
  console.log(`Calculating payable hours for ${format(checkInTime, 'yyyy-MM-dd HH:mm')} to ${format(checkOutTime, 'yyyy-MM-dd HH:mm')}, shift: ${shiftType}, penalty: ${penaltyMinutes} minutes, isManualEdit: ${isManualEdit}`);
  
  // Handle night shift specially - use specific calculation
  if (shiftType === 'night') {
    return calculateNightShiftHours(checkInTime, checkOutTime, penaltyMinutes, isManualEdit);
  }
  
  // NEW: Calculate effective start time (exclude early check-ins from payable hours)
  let effectiveStartTime = checkInTime;
  
  if (shiftType && (SHIFT_TIMES[shiftType] || shiftType === 'canteen_7am' || shiftType === 'canteen_8am')) {
    // Create scheduled start time for this date
    const scheduledStart = new Date(checkInTime);
    
    if (shiftType === 'canteen_7am') {
      scheduledStart.setHours(CANTEEN_SHIFT_HOURS.early.start.hour);
      scheduledStart.setMinutes(CANTEEN_SHIFT_HOURS.early.start.minute);
    } else if (shiftType === 'canteen_8am') {
      scheduledStart.setHours(CANTEEN_SHIFT_HOURS.late.start.hour);
      scheduledStart.setMinutes(CANTEEN_SHIFT_HOURS.late.start.minute);
    } else if (SHIFT_TIMES[shiftType]) {
      scheduledStart.setHours(SHIFT_TIMES[shiftType].start.hour);
      scheduledStart.setMinutes(SHIFT_TIMES[shiftType].start.minute);
    }
    
    scheduledStart.setSeconds(0);
    scheduledStart.setMilliseconds(0);
    
    // Use the later of actual check-in time or scheduled start time
    // This excludes early check-ins from payable hours calculation
    effectiveStartTime = checkInTime > scheduledStart ? checkInTime : scheduledStart;
    
    console.log(`Scheduled start: ${format(scheduledStart, 'HH:mm')}, Actual check-in: ${format(checkInTime, 'HH:mm')}, Effective start: ${format(effectiveStartTime, 'HH:mm')}`);
  }
  
  // Calculate minutes between effective start time and check-out
  let diffInMinutes = differenceInMinutes(checkOutTime, effectiveStartTime);
  
  // Log the raw time difference before penalty
  console.log(`Raw time difference: ${diffInMinutes} minutes (${(diffInMinutes/60).toFixed(2)} hours)`);
  
  // Convert to hours
  let hours = diffInMinutes / 60;
  
  // Store the raw, penalty-adjusted hours before business rules
  let penaltyAdjustedHours = hours;
  
  // For manual edits, always use the exact calculated hours
  if (isManualEdit) {
    console.log(`Manual edit detected - using exact calculated time: ${hours.toFixed(2)} hours`);
    
    // Apply penalty if any
    if (penaltyMinutes > 0) {
      const penaltyHours = penaltyMinutes / 60;
      hours = Math.max(0, hours - penaltyHours);
      console.log(`After penalty application: ${hours.toFixed(2)} hours`);
    }
    
    // Round to exactly a 2 decimal number
    const finalHours = parseFloat(hours.toFixed(2));
    console.log(`Final hours (manual edit): ${finalHours}`);
    return finalHours;
  }
  
  // Check if employee is significantly late (more than 1 hour)
  let isSignificantlyLate = false;
  if (shiftType && shiftType !== 'custom') {
    const expectedStart = getExpectedShiftStartTime(checkInTime, shiftType);
    const expectedStartMinutes = expectedStart.hour * 60 + expectedStart.minute;
    const actualStartMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
    
    // Calculate lateness in minutes
    let latenessInMinutes = actualStartMinutes - expectedStartMinutes;
    
    // Handle day rollover for night shifts (if check-in is early morning, it might be from previous day)
    if (shiftType === 'night' && checkInTime.getHours() < 12) {
      // If check-in is in early morning hours for night shift, it's likely from previous day
      latenessInMinutes = actualStartMinutes + (24 * 60) - expectedStartMinutes;
    }
    
    // If more than 60 minutes late, flag as significantly late
    isSignificantlyLate = latenessInMinutes > 60;
    
    console.log(`Expected start: ${expectedStart.hour.toString().padStart(2, '0')}:${expectedStart.minute.toString().padStart(2, '0')}, actual start: ${checkInTime.getHours().toString().padStart(2, '0')}:${checkInTime.getMinutes().toString().padStart(2, '0')}, lateness: ${latenessInMinutes} minutes, significantly late: ${isSignificantlyLate}`);
  }
  
  // NEW: Calculate overtime more accurately
  let overtimeHours = 0;
  if (shiftType && (SHIFT_TIMES[shiftType] || shiftType === 'canteen_7am' || shiftType === 'canteen_8am')) {
    // Create scheduled end time
    const scheduledEnd = new Date(effectiveStartTime);
    
    if (shiftType === 'canteen_7am') {
      scheduledEnd.setHours(CANTEEN_SHIFT_HOURS.early.end.hour);
      scheduledEnd.setMinutes(CANTEEN_SHIFT_HOURS.early.end.minute);
    } else if (shiftType === 'canteen_8am') {
      scheduledEnd.setHours(CANTEEN_SHIFT_HOURS.late.end.hour);
      scheduledEnd.setMinutes(CANTEEN_SHIFT_HOURS.late.end.minute);
    } else if (SHIFT_TIMES[shiftType]) {
      scheduledEnd.setHours(SHIFT_TIMES[shiftType].end.hour);
      scheduledEnd.setMinutes(SHIFT_TIMES[shiftType].end.minute);
    }
    
    scheduledEnd.setSeconds(0);
    scheduledEnd.setMilliseconds(0);
    
    // For shifts that cross midnight (like night shift), adjust the end date
    if (shiftType === 'night' || (SHIFT_TIMES[shiftType] && SHIFT_TIMES[shiftType].end.hour < SHIFT_TIMES[shiftType].start.hour)) {
      scheduledEnd.setDate(scheduledEnd.getDate() + 1);
    }
    
    // Calculate overtime only if checked out after scheduled end time
    if (checkOutTime > scheduledEnd) {
      const overtimeMinutes = differenceInMinutes(checkOutTime, scheduledEnd);
      overtimeHours = overtimeMinutes / 60;
      console.log(`Overtime calculation: scheduled end ${format(scheduledEnd, 'HH:mm')}, actual checkout ${format(checkOutTime, 'HH:mm')}, overtime: ${overtimeHours.toFixed(2)} hours`);
      
      // Apply 30-minute minimum rule for overtime
      if (overtimeMinutes < 30) {
        console.log(`Overtime ${overtimeMinutes} minutes < 30 minutes minimum, not crediting overtime`);
        overtimeHours = 0;
      }
    }
  }
  
  // Apply business rules for standardized hours
  
  // Excessive overtime: If > 9.5, preserve actual hours worked
  // but if > 15, cap at 15 hours
  if (hours > 15.0) {
    hours = 15.0;
    console.log(`Capped excessive hours to 15.0`);
  } else if (hours > 9.5) {
    // For substantial overtime, round to the nearest 15 minutes
    hours = Math.round(hours * 4) / 4;
    console.log(`Rounded substantial overtime to ${hours} hours`);
  } else if (!isSignificantlyLate) {
    // NEW: For regular shifts, use 9 hours base + overtime (if any)
    const baseHours = 9.0;
    
    // Check for early leave - if employee leaves more than 30 minutes early, use actual hours
    let isSignificantEarlyLeave = false;
    if (shiftType && (SHIFT_TIMES[shiftType] || shiftType === 'canteen_7am' || shiftType === 'canteen_8am')) {
      const scheduledEnd = new Date(effectiveStartTime);
      
      if (shiftType === 'canteen_7am') {
        scheduledEnd.setHours(CANTEEN_SHIFT_HOURS.early.end.hour);
        scheduledEnd.setMinutes(CANTEEN_SHIFT_HOURS.early.end.minute);
      } else if (shiftType === 'canteen_8am') {
        scheduledEnd.setHours(CANTEEN_SHIFT_HOURS.late.end.hour);
        scheduledEnd.setMinutes(CANTEEN_SHIFT_HOURS.late.end.minute);
      } else if (SHIFT_TIMES[shiftType]) {
        scheduledEnd.setHours(SHIFT_TIMES[shiftType].end.hour);
        scheduledEnd.setMinutes(SHIFT_TIMES[shiftType].end.minute);
      }
      
      scheduledEnd.setSeconds(0);
      scheduledEnd.setMilliseconds(0);
      
      // For shifts that cross midnight (like night shift), adjust the end date
      if (shiftType === 'night' || (SHIFT_TIMES[shiftType] && SHIFT_TIMES[shiftType].end.hour < SHIFT_TIMES[shiftType].start.hour)) {
        scheduledEnd.setDate(scheduledEnd.getDate() + 1);
      }
      
      // Check if employee left more than 30 minutes early
      if (checkOutTime < scheduledEnd) {
        const earlyLeaveMinutes = differenceInMinutes(scheduledEnd, checkOutTime);
        isSignificantEarlyLeave = earlyLeaveMinutes > 30;
        console.log(`Early leave check: scheduled end ${format(scheduledEnd, 'HH:mm')}, actual checkout ${format(checkOutTime, 'HH:mm')}, early by ${earlyLeaveMinutes} minutes, significant: ${isSignificantEarlyLeave}`);
      }
    }
    
    // If significant early leave, use actual hours worked
    if (isSignificantEarlyLeave) {
      console.log(`Employee left significantly early (>30 min): using actual hours worked (${hours.toFixed(2)})`);
      // Keep the actual calculated hours
    } else {
      // Only add overtime if there's significant overtime (>= 30 minutes)
      if (overtimeHours >= 0.5) { // 30 minutes = 0.5 hours
        hours = baseHours + overtimeHours;
        console.log(`Applied base hours (${baseHours}) + overtime (${overtimeHours.toFixed(2)}) = ${hours.toFixed(2)} hours`);
      } else {
        hours = baseHours;
        console.log(`Applied standard ${baseHours} hours (no significant overtime)`);
      }
    }
  } else {
    // Employee is significantly late (>1 hour), use actual hours worked
    console.log(`Employee is significantly late (>1 hour): using actual hours worked (${hours.toFixed(2)})`);
  }
  
  // Apply penalty - ensure hours are reduced if there are penalty minutes
  // Convert penalty minutes to hours
  if (penaltyMinutes > 0) {
    const penaltyHours = penaltyMinutes / 60;
    // If penalty is for a full day or more, ensure hours are 0
    if (penaltyHours >= 9) {
      hours = 0;
      console.log(`Applied full day penalty: 0 hours`);
    } else {
      // Otherwise make sure hours are reduced by the penalty
      hours = Math.max(0, hours - penaltyHours);
      console.log(`After penalty application: ${hours.toFixed(2)} hours`);
    }
  }
  
  // Round to exactly a 2 decimal number
  const finalHours = parseFloat(hours.toFixed(2));
  console.log(`Final payable hours: ${finalHours}`);
  return finalHours;
};

// Calculate night shift hours with special handling for cross-day shifts
export const calculateNightShiftHours = (
  checkInTime: Date, 
  checkOutTime: Date,
  penaltyMinutes: number = 0,
  isManualEdit: boolean = false // New parameter to indicate manual time edits
): number => {
  console.log(`Calculating night shift hours for ${format(checkInTime, 'yyyy-MM-dd HH:mm')} to ${format(checkOutTime, 'yyyy-MM-dd HH:mm')}, penalty: ${penaltyMinutes} minutes, isManualEdit: ${isManualEdit}`);
  
  // Create copies to avoid modifying original dates
  const checkIn = new Date(checkInTime);
  let checkOut = new Date(checkOutTime);
  
  // If both times are same day and checkout is earlier, assume it's next day
  if (isSameDay(checkIn, checkOut) && checkIn > checkOut) {
    checkOut = addDays(checkOut, 1);
    console.log(`Adjusted checkout to next day: ${format(checkOut, 'yyyy-MM-dd HH:mm')}`);
  }
  
  // If checkout date is different from check-in date, make sure it's only one day ahead
  // (This handles both normal next-day checkouts and already-computed next-day dates)
  if (!isSameDay(checkIn, checkOut)) {
    const checkInDateOnly = new Date(
      checkIn.getFullYear(), 
      checkIn.getMonth(), 
      checkIn.getDate()
    );
    
    const checkOutDateOnly = new Date(
      checkOut.getFullYear(), 
      checkOut.getMonth(), 
      checkOut.getDate()
    );
    
    const dayDiff = Math.round((checkOutDateOnly.getTime() - checkInDateOnly.getTime()) / (24 * 60 * 60 * 1000));
    
    // If day difference is greater than 1, adjust checkout to be exactly 1 day after check-in
    if (dayDiff > 1) {
      checkOut = new Date(checkIn);
      checkOut.setDate(checkOut.getDate() + 1);
      checkOut.setHours(checkOutTime.getHours(), checkOutTime.getMinutes(), checkOutTime.getSeconds());
      console.log(`Adjusted checkout for excessive days: ${format(checkOut, 'yyyy-MM-dd HH:mm')}`);
    } else if (dayDiff < 0) {
      // If checkout appears to be before check-in, move it to the next day
      checkOut = new Date(checkIn);
      checkOut.setDate(checkOut.getDate() + 1);
      checkOut.setHours(checkOutTime.getHours(), checkOutTime.getMinutes(), checkOutTime.getSeconds());
      console.log(`Adjusted checkout that appeared to be before checkin: ${format(checkOut, 'yyyy-MM-dd HH:mm')}`);
    }
  }
  
  // NEW: Calculate effective start time for night shift (exclude early check-ins)
  let effectiveStartTime = checkIn;
  
  if (SHIFT_TIMES.night) {
    // Create scheduled start time for night shift (21:00)
    const scheduledStart = new Date(checkIn);
    scheduledStart.setHours(SHIFT_TIMES.night.start.hour);
    scheduledStart.setMinutes(SHIFT_TIMES.night.start.minute);
    scheduledStart.setSeconds(0);
    scheduledStart.setMilliseconds(0);
    
    // Use the later of actual check-in time or scheduled start time
    effectiveStartTime = checkIn > scheduledStart ? checkIn : scheduledStart;
    
    console.log(`Night shift - Scheduled start: ${format(scheduledStart, 'HH:mm')}, Actual check-in: ${format(checkIn, 'HH:mm')}, Effective start: ${format(effectiveStartTime, 'HH:mm')}`);
  }
  
  // Calculate minutes between effective start time and check-out
  let diffInMinutes = differenceInMinutes(checkOut, effectiveStartTime);
  
  console.log(`Raw time difference: ${diffInMinutes} minutes (${(diffInMinutes/60).toFixed(2)} hours)`);
  
  // Convert to hours
  let hours = diffInMinutes / 60;
  
  // For manual edits, always use exact calculated hours
  if (isManualEdit) {
    console.log(`Manual edit detected - using exact calculated time: ${hours.toFixed(2)} hours`);
    
    // Apply penalty if any
    if (penaltyMinutes > 0) {
      const penaltyHours = penaltyMinutes / 60;
      hours = Math.max(0, hours - penaltyHours);
      console.log(`After penalty application: ${hours.toFixed(2)} hours`);
    }
    
    // Round to exactly a 2 decimal number
    const finalHours = parseFloat(hours.toFixed(2));
    console.log(`Final hours (manual edit): ${finalHours}`);
    return finalHours;
  }
  
  // NEW: Calculate overtime for night shift more accurately
  let overtimeHours = 0;
  
  // Create scheduled end time for night shift (06:00 next day)
  const scheduledEnd = new Date(effectiveStartTime);
  scheduledEnd.setDate(scheduledEnd.getDate() + 1); // Next day
  scheduledEnd.setHours(SHIFT_TIMES.night.end.hour);
  scheduledEnd.setMinutes(SHIFT_TIMES.night.end.minute);
  scheduledEnd.setSeconds(0);
  scheduledEnd.setMilliseconds(0);
  
  // Calculate overtime only if checked out after scheduled end time
  if (checkOut > scheduledEnd) {
    const overtimeMinutes = differenceInMinutes(checkOut, scheduledEnd);
    overtimeHours = overtimeMinutes / 60;
    console.log(`Night shift overtime: scheduled end ${format(scheduledEnd, 'HH:mm')}, actual checkout ${format(checkOut, 'HH:mm')}, overtime: ${overtimeHours.toFixed(2)} hours`);
    
    // Apply 30-minute minimum rule for overtime
    if (overtimeMinutes < 30) {
      console.log(`Overtime ${overtimeMinutes} minutes < 30 minutes minimum, not crediting overtime`);
      overtimeHours = 0;
    }
  }
  
  // Night shift hours calculation rules:
  // 1. Cap at 15 hours for excessive shifts
  // 2. For substantial overtime (>9.5h), round to nearest 15 minutes
  // 3. Use 9 hours base + overtime (if any)
  
  // Apply night shift specific rules
  if (hours > 15.0) {
    hours = 15.0; // Cap at 15 hours
    console.log(`Capped excessive hours to 15.0`);
  } else if (hours > 9.5) {
    // For substantial overtime, round to the nearest 15 minutes
    hours = Math.round(hours * 4) / 4;
    console.log(`Rounded substantial overtime to ${hours} hours`);
  } else {
    // NEW: Use base hours + overtime for night shift
    const baseHours = 9.0;
    
    // Check for early leave in night shift
    let isSignificantEarlyLeave = false;
    
    // Create scheduled end time for night shift (06:00 next day)
    const scheduledEnd = new Date(effectiveStartTime);
    scheduledEnd.setDate(scheduledEnd.getDate() + 1); // Next day
    scheduledEnd.setHours(SHIFT_TIMES.night.end.hour);
    scheduledEnd.setMinutes(SHIFT_TIMES.night.end.minute);
    scheduledEnd.setSeconds(0);
    scheduledEnd.setMilliseconds(0);
    
    // Check if employee left more than 30 minutes early
    if (checkOut < scheduledEnd) {
      const earlyLeaveMinutes = differenceInMinutes(scheduledEnd, checkOut);
      isSignificantEarlyLeave = earlyLeaveMinutes > 30;
      console.log(`Night shift early leave check: scheduled end ${format(scheduledEnd, 'HH:mm')}, actual checkout ${format(checkOut, 'HH:mm')}, early by ${earlyLeaveMinutes} minutes, significant: ${isSignificantEarlyLeave}`);
    }
    
    // If significant early leave, use actual hours worked
    if (isSignificantEarlyLeave) {
      console.log(`Night shift employee left significantly early (>30 min): using actual hours worked (${hours.toFixed(2)})`);
      // Keep the actual calculated hours
    } else {
      // Only add overtime if there's significant overtime (>= 30 minutes)
      if (overtimeHours >= 0.5) { // 30 minutes = 0.5 hours
        hours = baseHours + overtimeHours;
        console.log(`Night shift: Applied base hours (${baseHours}) + overtime (${overtimeHours.toFixed(2)}) = ${hours.toFixed(2)} hours`);
      } else {
        hours = baseHours;
        console.log(`Night shift: Applied standard ${baseHours} hours (no significant overtime)`);
      }
    }
  }
  
  // Apply penalty - ensure hours are reduced if there are penalty minutes
  if (penaltyMinutes > 0) {
    const penaltyHours = penaltyMinutes / 60;
    // If penalty is for a full day or more, ensure hours are 0
    if (penaltyHours >= 9) {
      hours = 0;
      console.log(`Applied full day penalty: 0 hours`);
    } else {
      // Otherwise make sure hours are reduced by the penalty
      hours = Math.max(0, hours - penaltyHours);
      console.log(`After penalty application: ${hours.toFixed(2)} hours`);
    }
  }
  
  // Round to exactly a 2 decimal number
  const finalHours = parseFloat(hours.toFixed(2));
  console.log(`Final night shift hours: ${finalHours}`);
  return finalHours;
};

// Check if checkout time represents excessive overtime
export const isExcessiveOvertime = (checkOut: Date, shiftType: 'morning' | 'evening' | 'night' | 'canteen' | 'canteen_7am' | 'canteen_8am' | 'custom' | null): boolean => {
  if (!shiftType) return false;
  
  // Get expected end time based on shift type
  let endHour: number;
  
  if (shiftType === 'canteen_7am') {
    endHour = CANTEEN_SHIFT_HOURS.early.end.hour;
  } else if (shiftType === 'canteen_8am') {
    endHour = CANTEEN_SHIFT_HOURS.late.end.hour;
  } else if (shiftType === 'canteen') {
    endHour = CANTEEN_SHIFT_HOURS.early.end.hour; // Default to 7 AM canteen
  } else if (SHIFT_TIMES[shiftType]) {
    endHour = SHIFT_TIMES[shiftType].end.hour;
  } else {
    return false;
  }
  
  // Add 1 hour to the expected end time for overtime threshold
  const overtimeHour = endHour + 1;
  
  // For night shifts, we need to handle hours around midnight differently
  if (shiftType === 'night') {
    const hour = checkOut.getHours();
    
    // For night shift, normal checkout is 6 AM
    // If checkout is after 7 AM, consider it excessive
    if (hour >= 7 && hour <= 12) {
      return true;
    }
    
    return false;
  }
  
  // For canteen shifts
  if (shiftType === 'canteen_7am' || shiftType === 'canteen') {
    const hour = checkOut.getHours();
    if (hour >= 17) { // After 5 PM for 7 AM canteen
      return true;
    }
    return false;
  }
  
  if (shiftType === 'canteen_8am') {
    const hour = checkOut.getHours();
    if (hour >= 18) { // After 6 PM for 8 AM canteen
      return true;
    }
    return false;
  }
  
  // For other shifts, check if checkout hour is at least 1 hour after expected end
  if (checkOut.getHours() >= overtimeHour) {
    return true;
  }
  
  return false;
};

// Check if a sequence of records indicates a likely night shift worker
export const isLikelyNightShiftWorker = (records: TimeRecord[]): boolean => {
  if (records.length < 2) return false;
  
  // Count how many check-ins occur during typical night shift hours (8 PM - 4 AM)
  const nightCheckIns = records.filter(record => {
    if (record.status !== 'check_in') return false;
    
    const hour = record.timestamp.getHours();
    return (hour >= 20) || (hour >= 0 && hour < 4); // 8 PM - 4 AM
  }).length;
  
  // Count total check-ins
  const totalCheckIns = records.filter(record => record.status === 'check_in').length;
  
  // Count how many check-outs occur during early morning hours (5 AM - 8 AM)
  const earlyMorningCheckOuts = records.filter(record => {
    if (record.status !== 'check_out') return false;
    
    const hour = record.timestamp.getHours();
    return hour >= 5 && hour <= 8; // 5 AM - 8 AM
  }).length;
  
  // If at least 30% of check-ins are during night shift hours, or we have several early morning checkouts,
  // consider them a night shift worker
  return (totalCheckIns > 0 && (nightCheckIns / totalCheckIns >= 0.3)) ||
         (earlyMorningCheckOuts >= 2); // Having 2+ early morning checkouts strongly suggests night shift
};

// Check if time falls within a morning shift time range
export const hasMorningShiftTimeRange = (timestamp: Date): boolean => {
  const hour = timestamp.getHours();
  return (hour >= 5 && hour <= 7) || (hour >= 13 && hour <= 15);
};

// Analyze if employee shows pattern of morning shift work
export const isMorningShiftPattern = (records: TimeRecord[]): number => {
  if (records.length < 2) return 0;
  
  // Get distinct days with morning hour check-ins (5-8 AM)
  const morningCheckInDays = new Set<string>();
  
  // Get days with data that match morning shift criteria
  for (const record of records) {
    const hour = record.timestamp.getHours();
    
    // Check-ins between 5-8 AM are likely morning shift
    if (record.status === 'check_in' && hour >= 5 && hour <= 8) {
      const date = format(record.timestamp, 'yyyy-MM-dd');
      morningCheckInDays.add(date);
    }
    
    // Check-outs between 1-3 PM are likely morning shift
    if (record.status === 'check_out' && hour >= 13 && hour <= 15) {
      const date = format(record.timestamp, 'yyyy-MM-dd');
      morningCheckInDays.add(date);
    }
  }
  
  // Return count of days with morning shift patterns
  return morningCheckInDays.size;
};

// Identify if a timestamp is likely a night shift check-out (5-7 AM)
export const isLikelyNightShiftCheckOut = (timestamp: Date): boolean => {
  const hour = getHours(timestamp);
  return hour >= 5 && hour <= 7; // Early morning hours typical for night shift checkout
};

// Check if timestamp should be handled as a possible night shift
export const shouldHandleAsPossibleNightShift = (timestamp: Date): boolean => {
  const hour = getHours(timestamp);
  
  // Early morning times (5-7 AM) are commonly associated with night shifts
  if (hour >= 5 && hour <= 7) {
    return true;
  }
  
  // Late evening times (8 PM to midnight) are commonly associated with night shifts
  if (hour >= 20) {
    return true;
  }
  
  return false;
};

// Check if a timestamp is likely a night shift check-in
export const isNightShiftCheckIn = (timestamp: Date): boolean => {
  const hour = timestamp.getHours();
  return hour >= 20 && hour <= 23; // Between 8 PM and 11 PM
};

// Check if a timestamp is likely a night shift check-out
export const isNightShiftCheckOut = (timestamp: Date): boolean => {
  const hour = timestamp.getHours();
  return hour >= 5 && hour <= 8; // Between 5 AM and 8 AM
};

// Check for a night shift pattern in records
export const isNightShiftPattern = (checkInTime: Date, checkOutTime: Date): boolean => {
  const checkInHour = checkInTime.getHours();
  const checkOutHour = checkOutTime.getHours();
  
  // Night shift pattern: check-in in evening (8-11 PM), check-out in early morning (5-8 AM)
  return (checkInHour >= 20 && checkInHour <= 23) && 
         (checkOutHour >= 5 && checkOutHour <= 8);
};

// Detect if a record is likely from a night shift
export const isLikelyFromNightShift = (record: any): boolean => {
  const timestamp = record.timestamp;
  const hour = getHours(timestamp);
  
  // Night shifts typically check in between 20:00-22:00 and out between 05:00-07:00
  if (record.status === 'check_in') {
    return hour >= 20 && hour <= 22;
  } else if (record.status === 'check_out') {
    return hour >= 5 && hour <= 7;
  }
  
  return false;
};

// Find matching records that could form a night shift pair
export const findNightShiftPair = (records: any[]): { checkIn: any | null, checkOut: any | null } => {
  // Sort records by timestamp
  const sortedRecords = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // Try to find night shift check-in (evening) and check-out (morning next day)
  let nightCheckIn = null;
  let nightCheckOut = null;
  
  // Find potential check-ins (evening hours)
  for (const record of sortedRecords) {
    const hour = getHours(record.timestamp);
    if (hour >= 20 && hour <= 22) {
      if (record.status === 'check_in') {
        nightCheckIn = record;
        break;
      } else {
        // Potential mislabeled check-in
        nightCheckIn = record;
        break;
      }
    }
  }
  
  // Find potential check-outs (morning hours next day)
  if (nightCheckIn) {
    const checkInDate = format(nightCheckIn.timestamp, 'yyyy-MM-dd');
    
    for (const record of sortedRecords) {
      const recordDate = format(record.timestamp, 'yyyy-MM-dd');
      const hour = getHours(record.timestamp);
      
      // Look for records on the next day with early morning hours
      if (recordDate > checkInDate && hour >= 5 && hour <= 7) {
        if (record.status === 'check_out') {
          nightCheckOut = record;
          break;
        } else {
          // Potential mislabeled check-out
          nightCheckOut = record;
          break;
        }
      }
    }
  }
  
  return { checkIn: nightCheckIn, checkOut: nightCheckOut };
};

// Check if the employee has evening shift patterns
export const isEveningShiftPattern = (records: TimeRecord[]): boolean => {
  if (records.length < 2) return false;
  
  // Count check-ins between 12:30 PM and 2 PM (typical evening shift start time)
  const eveningCheckIns = records.filter(r => {
    if (r.status !== 'check_in') return false;
    
    const hour = r.timestamp.getHours();
    const minute = r.timestamp.getMinutes();
    
    return (hour === 12 && minute >= 30) || hour === 13 || (hour === 14 && minute === 0);
  }).length;
  
  // Count check-outs between 9 PM and 11 PM (typical evening shift end time)
  const eveningCheckOuts = records.filter(r => {
    if (r.status !== 'check_out') return false;
    
    const hour = r.timestamp.getHours();
    return hour >= 21 && hour <= 22;
  }).length;
  
  const totalCheckIns = records.filter(r => r.status === 'check_in').length;
  
  // Detect evening shift pattern
  // 1. At least 30% of check-ins are between 12:30-2 PM, OR
  // 2. At least 2 check-outs are between 9-10 PM
  return (totalCheckIns > 0 && (eveningCheckIns / totalCheckIns >= 0.3)) || (eveningCheckOuts >= 2);
};

// Check if the given date had an evening shift based on the records
export const hadEveningShiftOnDate = (records: TimeRecord[], dateStr: string): boolean => {
  // Look for check-ins between 12:30 PM and 2:00 PM on this date
  const eveningCheckIn = records.some(r => {
    if (r.status !== 'check_in') return false;
    
    const recordDate = format(r.timestamp, 'yyyy-MM-dd');
    if (recordDate !== dateStr) return false;
    
    const hour = r.timestamp.getHours();
    const minute = r.timestamp.getMinutes();
    
    return (hour === 12 && minute >= 30) || hour === 13 || (hour === 14 && minute === 0);
  });
  
  // Also look for check-outs between 9:00 PM and 10:30 PM on this date
  const eveningCheckOut = records.some(r => {
    if (r.status !== 'check_out') return false;
    
    const recordDate = format(r.timestamp, 'yyyy-MM-dd');
    if (recordDate !== dateStr) return false;
    
    const hour = r.timestamp.getHours();
    
    return hour >= 21 && hour <= 22;
  });
  
  // Return true if either evening check-in or checkout was found
  return eveningCheckIn || eveningCheckOut;
};

// Get the expected checkout time display for evening shift based on historical patterns
export const getEveningShiftCheckoutDisplay = (day: number): string => {
  // Fixed: Return correct time for evening shift checkout
  return "22:00";
};