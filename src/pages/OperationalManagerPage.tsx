import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Users, Calendar, LogOut, Home, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import NavigationTabs from '../components/NavigationTabs';
import LeaveBalanceTracking from '../components/OperationalManager/LeaveBalanceTracking';
import LeaveTypeOverview from '../components/OperationalManager/LeaveTypeOverview';

const OperationalManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [activeView, setActiveView] = useState<'pending' | 'balance'>('pending');
  
  useEffect(() => {
    fetchLeaveRequests();
  }, []);
  
  const fetchLeaveRequests = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          id, 
          leave_type, 
          start_date, 
          end_date, 
          reason, 
          status, 
          created_at,
          employee_id,
          employees (
            id,
            name,
            employee_number
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setLeaveRequests(data || []);
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      toast.error('Failed to load leave requests');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleApproveLeave = async (requestId: string) => {
    setIsProcessing(prev => ({ ...prev, [requestId]: true }));
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved' })
        .eq('id', requestId);
        
      if (error) throw error;
      
      // Update local state
      setLeaveRequests(prev => prev.map(req => 
        req.id === requestId ? { ...req, status: 'approved' } : req
      ));
      
      toast.success('Leave request approved');
    } catch (error) {
      console.error('Error approving leave request:', error);
      toast.error('Failed to approve leave request');
    } finally {
      setIsProcessing(prev => ({ ...prev, [requestId]: false }));
    }
  };
  
  const handleRejectLeave = async (requestId: string) => {
    setIsProcessing(prev => ({ ...prev, [requestId]: true }));
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);
        
      if (error) throw error;
      
      // Update local state
      setLeaveRequests(prev => prev.map(req => 
        req.id === requestId ? { ...req, status: 'rejected' } : req
      ));
      
      toast.success('Leave request rejected');
    } catch (error) {
      console.error('Error rejecting leave request:', error);
      toast.error('Failed to reject leave request');
    } finally {
      setIsProcessing(prev => ({ ...prev, [requestId]: false }));
    }
  };
  
  const formatLeaveType = (type: string): string => {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const pendingLeaveRequests = leaveRequests.filter(request => request.status === 'pending');

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationTabs />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100">
          {/* Card header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center">
                <Users className="w-5 h-5 text-purple-600 mr-2" />
                <h1 className="text-lg font-medium text-gray-800">
                  Operational Manager Dashboard
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="text-gray-600 hover:text-gray-800 font-medium flex items-center"
                >
                  <Home className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Back to Home</span>
                  <span className="sm:hidden">Home</span>
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="text-red-600 hover:text-red-800 font-medium flex items-center"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* View selector tabs */}
          <div className="border-b border-gray-200 px-6">
            <div className="flex -mb-px">
              <button
                className={`py-4 px-6 text-sm font-medium ${
                  activeView === 'pending'
                    ? 'text-purple-600 border-b-2 border-purple-500'
                    : 'text-gray-500 border-b-2 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveView('pending')}
              >
                Pending Requests
                {pendingLeaveRequests.length > 0 && (
                  <span className="ml-2 bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs">
                    {pendingLeaveRequests.length}
                  </span>
                )}
              </button>
              <button
                className={`py-4 px-6 text-sm font-medium ${
                  activeView === 'balance'
                    ? 'text-purple-600 border-b-2 border-purple-500'
                    : 'text-gray-500 border-b-2 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveView('balance')}
              >
                Leave Balances
              </button>
            </div>
          </div>
          
          {/* Card content */}
          <div className="p-6 space-y-6">
            {activeView === 'pending' ? (
              <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <div className="bg-purple-50 p-4 border-b border-purple-100 flex justify-between items-center">
                  <h2 className="text-lg font-medium text-purple-800 flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-purple-600" />
                    Employee Leave Requests
                  </h2>
                  <button
                    onClick={fetchLeaveRequests}
                    className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                  >
                    Refresh
                  </button>
                </div>
                
                {isLoading ? (
                  <div className="p-8 text-center">
                    <div className="inline-block animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
                    <p className="mt-2 text-sm text-gray-500">Loading leave requests...</p>
                  </div>
                ) : pendingLeaveRequests.length === 0 ? (
                  <div className="p-8 text-center">
                    <Clock className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="mt-2 text-gray-500">No pending leave requests found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {pendingLeaveRequests.map((request) => (
                      <div key={request.id} className="p-4 hover:bg-gray-50">
                        <div className="sm:flex sm:justify-between sm:items-start">
                          <div>
                            <div className="flex items-center">
                              <h3 className="text-base font-medium text-gray-900">{request.employees.name}</h3>
                              <span className="ml-2 text-sm text-gray-500">#{request.employees.employee_number}</span>
                              <span className="ml-2 px-2 py-0.5 text-xs rounded-full flex items-center bg-amber-100 text-amber-800">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending
                              </span>
                            </div>
                            
                            <div className="mt-2 text-sm text-gray-700">
                              <div className="font-medium text-purple-700">{formatLeaveType(request.leave_type)}</div>
                              <div className="mt-1">
                                {format(parseISO(request.start_date), 'MMM d, yyyy')}
                                {request.start_date !== request.end_date ? 
                                  ` – ${format(parseISO(request.end_date), 'MMM d, yyyy')}` : 
                                  ' (1 day)'}
                              </div>
                              <p className="mt-1 text-gray-600">{request.reason}</p>
                            </div>
                            
                            <div className="mt-1 text-xs text-gray-500">
                              Requested on {format(parseISO(request.created_at), 'MMM d, yyyy')}
                            </div>
                          </div>
                          
                          <div className="mt-4 sm:mt-0 flex space-x-2">
                            <button
                              onClick={() => handleApproveLeave(request.id)}
                              disabled={isProcessing[request.id]}
                              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                            >
                              {isProcessing[request.id] ? 
                                <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></span> : 
                                <CheckCircle className="h-4 w-4 mr-1" />}
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectLeave(request.id)}
                              disabled={isProcessing[request.id]}
                              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                            >
                              {isProcessing[request.id] ? 
                                <span className="inline-block h-4 w-4 rounded-full border-2 border-gray-700 border-t-transparent animate-spin mr-2"></span> : 
                                <XCircle className="h-4 w-4 mr-1" />}
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <LeaveTypeOverview />
                <LeaveBalanceTracking />
              </>
            )}
          </div>
        </div>
      </div>
      
      <Toaster position="top-right" />
    </div>
  );
};

export default OperationalManagerPage;