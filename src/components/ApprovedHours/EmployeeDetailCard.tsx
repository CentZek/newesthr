import React from 'react';
import { format } from 'date-fns';
import { Calendar, Clock } from 'lucide-react';

interface EmployeeDetailCardProps {
  employee: any;
  doubleDays: string[];
}

const EmployeeDetailCard: React.FC<EmployeeDetailCardProps> = ({ employee, doubleDays }) => {
  // Calculate double-time hours
  const doubleTimeHours = employee.double_time_hours || 0;
  const regularHours = employee.total_hours || 0;
  // FIXED: Calculate total payable hours correctly - double-time hours are ADDED to regular hours
  const totalPayableHours = regularHours + doubleTimeHours;
  
  // Get working days and off days counts
  const totalDays = employee.total_days || 0;
  const offDaysCount = employee.off_days_count || 0;
  const workingDays = employee.working_days !== undefined ? employee.working_days : (totalDays - offDaysCount);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-800">{employee.name}</h3>
          <p className="text-base font-bold text-gray-500">Employee #{employee.employee_number}</p>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <div className="bg-gray-100 p-3 rounded-md">
            <p className="text-xs text-gray-500">Total Days</p>
            <p className="text-lg font-bold text-gray-800">{totalDays}</p>
          </div>
          
          <div className="bg-gray-100 p-3 rounded-md">
            <p className="text-xs text-gray-500">Working Days</p>
            <p className="text-lg font-bold text-gray-800">{workingDays}</p>
          </div>
          
          <div className="bg-gray-100 p-3 rounded-md">
            <p className="text-xs text-gray-500">Off Days</p>
            <p className="text-lg font-bold text-gray-800">{offDaysCount}</p>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-xs text-blue-600 font-medium">Regular Hours</p>
            <p className="text-lg font-bold text-blue-900">{regularHours.toFixed(2)}</p>
          </div>
          
          <div className="bg-amber-50 p-3 rounded-md">
            <div className="flex items-center gap-1">
              <p className="text-xs text-amber-500">Double-Time Hours</p>
              <span className="text-xs text-white bg-amber-500 rounded-full px-1 font-bold">2×</span>
            </div>
            <p className="text-lg font-bold text-amber-700">{doubleTimeHours.toFixed(2)}</p>
          </div>
          
          <div className="bg-green-50 p-3 rounded-md">
            <p className="text-xs text-green-500">Total Payable Hours</p>
            <p className="text-lg font-bold text-green-700">{totalPayableHours.toFixed(2)}</p>
          </div>
        </div>
      </div>
      
      <div className="border border-gray-200 rounded-md p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
          <Calendar className="w-4 h-4 mr-2 text-amber-500" />
          Double-Time Days
          <span className="ml-2 text-xs bg-amber-100 text-amber-800 rounded-full px-1.5 py-0.5 font-bold">2×</span>
        </h4>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {employee.working_week_dates?.filter((date: string) => doubleDays.includes(date))
            .sort()
            .map((date: string) => (
              <div key={date} className="flex justify-between items-center text-sm">
                <span className="text-gray-600 font-bold">
                  {format(new Date(date), 'EEE, MMM d, yyyy')}
                </span>
                <span className="font-bold text-amber-600">
                  {(() => {
                    const hoursWorked = employee.hours_by_date?.[date] || 0;
                    let bonusHours = 0;
                    
                    // Apply the same capping logic as in the database service
                    if (hoursWorked <= 9) {
                      bonusHours = hoursWorked;
                    } else {
                      bonusHours = Math.max(0, 18 - hoursWorked);
                    }
                    
                    const totalCredited = hoursWorked + bonusHours;
                    
                    return `${hoursWorked.toFixed(2)} + ${bonusHours.toFixed(2)} = ${totalCredited.toFixed(2)} hrs`;
                  })()}
                </span>
              </div>
            ))}
          {!employee.working_week_dates?.some((date: string) => doubleDays.includes(date)) && (
            <p className="text-sm text-gray-500 italic">No double-time days in this period</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetailCard;