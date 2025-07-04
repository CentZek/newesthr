Here's the fixed version with the missing closing bracket:

```typescript
const handleApplyPenalty = (employeeIndex: number, dayIndex: number, penaltyMinutes: number) => {
  console.log(`Applying penalty of ${penaltyMinutes} minutes to employee ${employeeIndex}, day ${dayIndex}`);
  
  // We've got both an index and potentially an ID - use the ID if it exists for more reliable editing
  setEmployeeRecords(prev => {
    const newRecords = [...prev];
    
    // Get the day by index first
    let day = newRecords[employeeIndex].days[dayIndex];
    
    // Verify if this is the right record by checking ID (if it exists)
    // This ensures we edit the right record even if the array order changes
    if (day.id) {
      // This will be more reliable after page refresh
      const dayId = day.id;
      // Double-check if we're using the right index after a refresh
      const correctDayIndex = newRecords[employeeIndex].days.findIndex(d => d.id === dayId);
      if (correctDayIndex !== -1 && correctDayIndex !== dayIndex) {
        console.log(`Corrected day index from ${dayIndex} to ${correctDayIndex} based on ID`);
        dayIndex = correctDayIndex;
        day = newRecords[employeeIndex].days[dayIndex];
      }
    }
    
    // Update penalty minutes
    day.penaltyMinutes = penaltyMinutes;
    
    // Recalculate hours worked with the penalty applied
    if (day.firstCheckIn && day.lastCheckOut) {
      // Derive shift type if missing
      const shiftType = day.shiftType || determineShiftType(day.firstCheckIn);
      
      // Update the shift type if it was missing
      if (!day.shiftType) {
        day.shiftType = shiftType;
      }
      
      console.log(`Before recalculation, hours were: ${day.hoursWorked.toFixed(2)}`);
      
      // Calculate new hours with penalty applied
      day.hoursWorked = calculatePayableHours(
        day.firstCheckIn, 
        day.lastCheckOut, 
        shiftType, 
        penaltyMinutes,
        true // Mark as manual edit to use exact time calculation
      );
      
      console.log(`After recalculation with ${penaltyMinutes} minute penalty, hours are: ${day.hoursWorked.toFixed(2)}`);
    } else {
      console.log(`Missing check-in or check-out for this day, cannot recalculate hours`);
    }
    
    return newRecords;
  });
  
  // Directly update in Supabase to ensure changes persist after refresh
  updateInSupabase(employeeRecords);
  
  toast.success(`Penalty applied: ${penaltyMinutes} minutes (${(penaltyMinutes / 60).toFixed(2)} hours)`);
};
```