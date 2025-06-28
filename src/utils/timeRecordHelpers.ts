/**
 * Time record helper functions for applying changes to daily records
 */
import { DailyRecord } from '../types';
import { calculatePayableHours, determineShiftType } from './shiftCalculations';

// Apply a penalty to a specific day
export const applyPenaltyToDay = (day: DailyRecord, penaltyMinutes: number): DailyRecord => {
  const updatedDay = { ...day };
  
  // Update penalty minutes
  updatedDay.penaltyMinutes = penaltyMinutes;
  
  // Recalculate hours worked with the penalty applied
  if (updatedDay.firstCheckIn && updatedDay.lastCheckOut) {
    // Derive shift type if missing
    const shiftType = updatedDay.shiftType || determineShiftType(updatedDay.firstCheckIn);
    
    // Update the shift type if it was missing
    if (!updatedDay.shiftType) {
      updatedDay.shiftType = shiftType;
    }
    
    console.log(`TimeRecordHelpers - Before recalculation, hours were: ${updatedDay.hoursWorked.toFixed(2)}`);
    
    // Calculate new hours with penalty applied
    updatedDay.hoursWorked = calculatePayableHours(
      updatedDay.firstCheckIn, 
      updatedDay.lastCheckOut, 
      shiftType, 
      penaltyMinutes,
      true // Mark as manual edit to use exact time calculation
    );
    
    console.log(`TimeRecordHelpers - After recalculation with ${penaltyMinutes} minute penalty, hours are: ${updatedDay.hoursWorked.toFixed(2)}`);
  } else {
    console.log(`Missing check-in or check-out for this day, cannot recalculate hours`);
  }
  
  return updatedDay;
};

// Update check-in and check-out times for a day
export const updateTimeRecords = (
  day: DailyRecord,
  checkIn: Date | null,
  checkOut: Date | null
): DailyRecord => {
  const updatedDay = { ...day };
  let didUpdate = false;
  
  // If both check-in and check-out are null, mark as OFF-DAY
  if (checkIn === null && checkOut === null) {
    updatedDay.firstCheckIn = null;
    updatedDay.lastCheckOut = null;
    updatedDay.missingCheckIn = true;
    updatedDay.missingCheckOut = true;
    updatedDay.hoursWorked = 0;
    updatedDay.notes = 'OFF-DAY';
    updatedDay.shiftType = 'off_day';
    updatedDay.isLate = false;
    updatedDay.earlyLeave = false;
    updatedDay.excessiveOvertime = false;
    updatedDay.penaltyMinutes = 0;
    updatedDay.displayCheckIn = 'OFF-DAY';
    updatedDay.displayCheckOut = 'OFF-DAY';
    
    return updatedDay;
  }
  
  // Update check-in and check-out times
  if (checkIn !== null && (!updatedDay.firstCheckIn || checkIn.getTime() !== updatedDay.firstCheckIn.getTime())) {
    updatedDay.firstCheckIn = checkIn;
    updatedDay.missingCheckIn = false;
    didUpdate = true;
  }
  
  if (checkOut !== null && (!updatedDay.lastCheckOut || checkOut.getTime() !== updatedDay.lastCheckOut.getTime())) {
    updatedDay.lastCheckOut = checkOut;
    updatedDay.missingCheckOut = false;
    didUpdate = true;
  }
  
  // Determine shift type if not already set or if this was an OFF-DAY
  if ((!updatedDay.shiftType || updatedDay.notes === 'OFF-DAY') && updatedDay.firstCheckIn) {
    updatedDay.shiftType = determineShiftType(updatedDay.firstCheckIn);
    // If we're changing from OFF-DAY, we need to update the notes
    if (updatedDay.notes === 'OFF-DAY') {
      updatedDay.notes = 'Manual entry';
    }
    didUpdate = true;
  }
  
  // Recalculate hours and flags
  if ((updatedDay.firstCheckIn && updatedDay.lastCheckOut && didUpdate) || 
      (updatedDay.notes === 'OFF-DAY' && (checkIn || checkOut))) {
    // If we have check-in and check-out times but this was an OFF-DAY, we need to update it
    if (updatedDay.notes === 'OFF-DAY' && checkIn && checkOut) {
      updatedDay.notes = 'Manual entry';
      updatedDay.shiftType = determineShiftType(checkIn);
    }

    const shiftType = updatedDay.shiftType || (updatedDay.firstCheckIn ? determineShiftType(updatedDay.firstCheckIn) : null);
    
    if (shiftType && updatedDay.firstCheckIn && updatedDay.lastCheckOut) {
      // Always recalculate hours when either check-in or check-out changes
      updatedDay.hoursWorked = calculatePayableHours(
        updatedDay.firstCheckIn, 
        updatedDay.lastCheckOut, 
        shiftType,
        updatedDay.penaltyMinutes,
        true // Mark as manual edit to use exact time calculation
      );
      
      console.log(`Calculated ${updatedDay.hoursWorked.toFixed(2)} hours for edited time records with ${updatedDay.penaltyMinutes} minute penalty`);
    }
  }
  
  // Set display values based on shift type
  if (updatedDay.shiftType) {
    const getStandardDisplayTime = (type: string, timeType: 'start' | 'end') => {
      const displayTimes = {
        morning: { startTime: '05:00', endTime: '14:00' },
        evening: { startTime: '13:00', endTime: '22:00' },
        night: { startTime: '21:00', endTime: '06:00' },
        canteen: { startTime: '07:00', endTime: '16:00' }, 
        off_day: { startTime: 'OFF-DAY', endTime: 'OFF-DAY' }
      };
      
      if (!type || !displayTimes[type as keyof typeof displayTimes]) return '';
      
      return timeType === 'start' ? 
        displayTimes[type as keyof typeof displayTimes].startTime : 
        displayTimes[type as keyof typeof displayTimes].endTime;
    };
    
    updatedDay.displayCheckIn = getStandardDisplayTime(updatedDay.shiftType, 'start');
    updatedDay.displayCheckOut = getStandardDisplayTime(updatedDay.shiftType, 'end');
  }
  
  return updatedDay;
};

// Set approval status for a day
export const setDayApprovalStatus = (day: DailyRecord, isApproved: boolean): DailyRecord => {
  return {
    ...day,
    approved: isApproved
  };
};

// Apply approval status to all days in a collection
export const approveAllDays = (days: DailyRecord[]): DailyRecord[] => {
  return days.map(day => ({
    ...day,
    approved: true
  }));
};