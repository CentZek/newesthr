import React, { useState } from 'react';
import { 
  Calendar, 
  FileText, 
  TrendingUp, 
  Info 
} from 'lucide-react';

// Define leave entitlements
const LEAVE_ENTITLEMENTS = {
  'annual-leave': { days: 21, color: 'bg-green-100 text-green-800', icon: <Calendar className="h-4 w-4" /> },
  'sick-leave': { days: 30, color: 'bg-red-100 text-red-800', icon: <FileText className="h-4 w-4" /> },
  'marriage-leave': { days: 5, color: 'bg-purple-100 text-purple-800', icon: <Calendar className="h-4 w-4" /> },
  'bereavement-leave': { days: null, color: 'bg-gray-100 text-gray-800', icon: <Info className="h-4 w-4" /> },
  'maternity-leave': { days: 98, color: 'bg-pink-100 text-pink-800', icon: <Calendar className="h-4 w-4" /> },
  'paternity-leave': { days: 2, color: 'bg-blue-100 text-blue-800', icon: <Calendar className="h-4 w-4" /> }
};

const LeaveTypeOverview: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Format leave type for display
  const formatLeaveType = (type: string): string => {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden mb-6">
      <div 
        className="p-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <TrendingUp className="h-5 w-5 text-purple-600 mr-2" />
          <h3 className="font-medium text-purple-800">Leave Types and Entitlements</h3>
        </div>
        <button className="text-purple-600 hover:text-purple-800">
          {isExpanded ? 'Hide' : 'Show'} Details
        </button>
      </div>
      
      {isExpanded && (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(LEAVE_ENTITLEMENTS).map(([type, { days, color, icon }]) => (
              <div key={type} className={`p-4 rounded-md ${color}`}>
                <div className="flex items-center">
                  <div className="mr-2">
                    {icon}
                  </div>
                  <h4 className="font-medium">{formatLeaveType(type)}</h4>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold">
                    {days !== null ? days : 'Case-by-case'}
                    {days !== null && <span className="text-sm ml-1">days/year</span>}
                  </p>
                  {type === 'bereavement-leave' && (
                    <p className="text-xs mt-1">Evaluated on a case-by-case basis</p>
                  )}
                  {type === 'paternity-leave' && (
                    <p className="text-xs mt-1">Up to 2 days</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 bg-gray-50 p-3 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Notes:</h4>
            <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
              <li>Leave balances are reset at the end of each calendar year</li>
              <li>Unused annual leave does not carry over to the next year</li>
              <li>Maternity and paternity leave is per event, not per year</li>
              <li>Bereavement leave is evaluated on a case-by-case basis by HR</li>
              <li>Medical certificate is required for sick leave exceeding 2 consecutive days</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveTypeOverview;