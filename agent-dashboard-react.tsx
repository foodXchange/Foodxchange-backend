import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Bell, 
  DollarSign, 
  MapPin, 
  Clock, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  Package,
  User,
  Activity
} from 'lucide-react';

// Types
interface Agent {
  id: string;
  name: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  status: string;
}

interface Lead {
  id: string;
  leadNumber: string;
  title: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  estimatedValue: {
    amount: number;
    currency: string;
  };
  location: string;
  matchScore: number;
  offerExpiresAt: string;
  timeRemaining: number;
}

interface Commission {
  id: string;
  type: string;
  amount: number;
  status: string;
  dealValue: number;
  leadNumber: string;
}

interface DashboardMetrics {
  availableLeads: number;
  activeLeads: number;
  closedDeals: number;
  totalCommissions: number;
  pendingCommissions: number;
  conversionRate: number;
  responseTime: number;
}

// Main Dashboard Component
const AgentDashboard: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [leads, setLeads] = useState<Map<string, Lead>>(new Map());
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    availableLeads: 0,
    activeLeads: 0,
    closedDeals: 0,
    totalCommissions: 0,
    pendingCommissions: 0,
    conversionRate: 0,
    responseTime: 0
  });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<string | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('agentToken');
    if (!token) return;

    const newSocket = io('http://localhost:5001/agents', {
      auth: { token }
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to agent WebSocket');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket');
    });

    newSocket.on('connected', (data) => {
      setAgent(data.agent);
    });

    newSocket.on('new_lead_available', (data) => {
      const lead = data.lead;
      setLeads(prev => new Map(prev).set(lead.id, lead));
      addNotification('New Lead Available!', `${lead.title} - Match Score: ${lead.matchScore}%`, 'info');
    });

    newSocket.on('commission_update', (data) => {
      addNotification('Commission Update', `$${data.commission.amount} ${data.commission.status}`, 'success');
      // Refresh metrics
      fetchDashboardData();
    });

    newSocket.on('lead_offer_expired', (data) => {
      setLeads(prev => {
        const newLeads = new Map(prev);
        newLeads.delete(data.leadId);
        return newLeads;
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('agentToken');
      const response = await fetch('/api/v1/agents/dashboard?period=month', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.dashboard) {
        setMetrics(data.dashboard.metrics);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Add notification
  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    const notification = {
      id: Date.now().toString(),
      title,
      message,
      type,
      timestamp: new Date()
    };
    setNotifications(prev => [notification, ...prev].slice(0, 10));
  };

  // Accept lead
  const acceptLead = (leadId: string) => {
    if (!socket) return;
    
    socket.emit('lead_response', {
      leadId,
      action: 'accept'
    });
    
    setLeads(prev => {
      const newLeads = new Map(prev);
      newLeads.delete(leadId);
      return newLeads;
    });
    
    addNotification('Lead Accepted', 'You have accepted the lead', 'success');
  };

  // Decline lead
  const declineLead = (leadId: string, reason: string) => {
    if (!socket) return;
    
    socket.emit('lead_response', {
      leadId,
      action: 'decline',
      reason
    });
    
    setLeads(prev => {
      const newLeads = new Map(prev);
      newLeads.delete(leadId);
      return newLeads;
    });
    
    addNotification('Lead Declined', `Reason: ${reason}`, 'warning');
  };

  // Format time remaining
  const formatTimeRemaining = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Get urgency color
  const getUrgencyColor = (urgency: string): string => {
    const colors = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    };
    return colors[urgency] || colors.medium;
  };

  // Get tier color
  const getTierColor = (tier: string): string => {
    const colors = {
      bronze: 'bg-amber-600',
      silver: 'bg-gray-400',
      gold: 'bg-yellow-500',
      platinum: 'bg-purple-600'
    };
    return colors[tier] || colors.bronze;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Agent Dashboard</h1>
              {agent && (
                <div className="ml-4 flex items-center">
                  <div className={`px-3 py-1 rounded-full text-white text-sm ${getTierColor(agent.tier)}`}>
                    {agent.tier.toUpperCase()}
                  </div>
                  <div className="ml-3 flex items-center">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                    <span className="text-sm text-gray-600">{isConnected ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <button className="relative p-2">
                <Bell className="h-6 w-6 text-gray-400" />
                {notifications.length > 0 && (
                  <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400"></span>
                )}
              </button>
              <div className="flex items-center">
                <User className="h-8 w-8 text-gray-400" />
                <span className="ml-2 text-sm font-medium text-gray-700">{agent?.name || 'Agent'}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Available Leads"
            value={leads.size}
            icon={<Bell className="h-6 w-6" />}
            color="blue"
          />
          <MetricCard
            title="Active Deals"
            value={metrics.activeLeads}
            icon={<Activity className="h-6 w-6" />}
            color="yellow"
          />
          <MetricCard
            title="Closed Deals"
            value={metrics.closedDeals}
            icon={<CheckCircle className="h-6 w-6" />}
            color="green"
          />
          <MetricCard
            title="Total Earnings"
            value={`$${metrics.totalCommissions.toFixed(2)}`}
            icon={<DollarSign className="h-6 w-6" />}
            color="purple"
          />
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Conversion Rate</h3>
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics.conversionRate.toFixed(1)}%</div>
            <p className="text-sm text-gray-500 mt-1">Last 30 days</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Avg Response Time</h3>
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics.responseTime} min</div>
            <p className="text-sm text-gray-500 mt-1">Keep it under 30 min</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Pending Commission</h3>
              <DollarSign className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900">${metrics.pendingCommissions.toFixed(2)}</div>
            <p className="text-sm text-gray-500 mt-1">Awaiting payment</p>
          </div>
        </div>

        {/* Available Leads */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Available Leads</h2>
          </div>
          <div className="p-6">
            {leads.size === 0 ? (
              <div className="text-center py-8">
                <Bell className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">No available leads at the moment</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from(leads.values()).map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onAccept={() => acceptLead(lead.id)}
                    onDecline={() => {
                      const reason = prompt('Reason for declining:');
                      if (reason) declineLead(lead.id, reason);
                    }}
                    formatTimeRemaining={formatTimeRemaining}
                    getUrgencyColor={getUrgencyColor}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Notifications */}
        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Recent Notifications</h2>
          </div>
          <div className="p-6">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500">No recent notifications</p>
            ) : (
              <div className="space-y-3">
                {notifications.map(notif => (
                  <div key={notif.id} className="flex items-start">
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                      notif.type === 'success' ? 'bg-green-500' :
                      notif.type === 'warning' ? 'bg-yellow-500' :
                      notif.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    }`}></div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">{notif.title}</p>
                      <p className="text-sm text-gray-500">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notif.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Metric Card Component
const MetricCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500'
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`${colorClasses[color]} text-white p-3 rounded-lg`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

// Lead Card Component
const LeadCard: React.FC<{
  lead: Lead;
  onAccept: () => void;
  onDecline: () => void;
  formatTimeRemaining: (ms: number) => string;
  getUrgencyColor: (urgency: string) => string;
}> = ({ lead, onAccept, onDecline, formatTimeRemaining, getUrgencyColor }) => {
  const [timeRemaining, setTimeRemaining] = useState(lead.timeRemaining);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = new Date(lead.offerExpiresAt).getTime() - Date.now();
      setTimeRemaining(Math.max(0, remaining));
    }, 1000);

    return () => clearInterval(interval);
  }, [lead.offerExpiresAt]);

  return (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{lead.title}</h3>
          <p className="text-sm text-gray-500 mt-1">Lead #{lead.leadNumber}</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getUrgencyColor(lead.urgency)}`}>
            {lead.urgency.toUpperCase()}
          </span>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">
              ${lead.estimatedValue.amount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">{lead.estimatedValue.currency}</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
        <div className="flex items-center text-gray-600">
          <MapPin className="h-4 w-4 mr-1" />
          {lead.location}
        </div>
        <div className="flex items-center text-gray-600">
          <TrendingUp className="h-4 w-4 mr-1" />
          Match Score: {lead.matchScore}%
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center text-sm">
          <Clock className="h-4 w-4 mr-1 text-red-500" />
          <span className={`font-medium ${timeRemaining < 300000 ? 'text-red-600' : 'text-gray-600'}`}>
            {formatTimeRemaining(timeRemaining)}
          </span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onDecline}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentDashboard;