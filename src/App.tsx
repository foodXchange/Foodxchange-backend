import { useState } from 'react';
import './App.css';
import { LoginForm } from './features/auth/LoginForm';
import { Header } from './components/layout/Header';
import { DashboardCards } from './features/dashboard/DashboardCards';
import { RFQList } from './features/rfq/RFQList';
import { ComplianceDashboard } from './features/compliance';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/Card';
import { Button } from './components/ui/Button';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [apiResponse, setApiResponse] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const testAPI = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/health');
      const data = await response.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setApiResponse('Error: ' + (error as Error).message);
    }
  };

  const testComplianceAPI = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/compliance/health');
      const data = await response.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setApiResponse('Compliance API Error: ' + (error as Error).message);
    }
  };

  const handleLogin = (data: { email: string; password: string; rememberMe?: boolean }) => {
    setLoginLoading(true);
    setLoginError('');
    
    setTimeout(() => {
      try {
        if (data.email === 'demo@foodxchange.com' && data.password === 'demo123') {
          setIsLoggedIn(true);
          // Store a fake token for API calls
          localStorage.setItem('token', 'demo-token-123');
        } else {
          setLoginError('Invalid credentials. Use demo@foodxchange.com / demo123');
        }
      } catch (error) {
        setLoginError('Login failed. Please try again.');
      } finally {
        setLoginLoading(false);
      }
    }, 1000);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentView('dashboard');
    setApiResponse('');
    setLoginError('');
    localStorage.removeItem('token');
  };

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', description: 'Overview & Analytics' },
    { id: 'rfq', label: 'RFQ Management', description: 'Request for Quotations' },
    { id: 'marketplace', label: 'Marketplace', description: 'Browse Products' },
    { id: 'compliance', label: 'Compliance Center', description: 'Validation & Safety' },
    { id: 'logistics', label: 'Logistics', description: 'Shipping & Tracking' },
  ];

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">FoodXchange</h1>
            <p className="text-gray-600">B2B Food Commerce Platform</p>
          </div>
          
          <LoginForm 
            onLogin={handleLogin}
            loading={loginLoading}
            error={loginError}
          />
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={testAPI}
                  className="w-full"
                >
                  Test Backend API
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={testComplianceAPI}
                  className="w-full"
                >
                  Test Compliance API
                </Button>
                {apiResponse && (
                  <div className="mt-3">
                    <h4 className="font-semibold mb-2 text-sm">API Response:</h4>
                    <pre className="bg-gray-100 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {apiResponse}
                    </pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onLogout={handleLogout} />
      
      <div className="flex">
        {/* Sidebar Navigation */}
        <div className="w-64 bg-white shadow-sm min-h-screen">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Navigation</h2>
            <nav className="space-y-2">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    currentView === item.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.description}</div>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          {currentView === 'dashboard' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-600">Welcome to FoodXchange - Your B2B Food Commerce Platform</p>
              </div>
              <DashboardCards />
            </div>
          )}

          {currentView === 'rfq' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">RFQ Management</h1>
                <p className="text-gray-600">Manage your Request for Quotations</p>
              </div>
              <RFQList />
            </div>
          )}

          {currentView === 'marketplace' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
                <p className="text-gray-600">Discover and connect with food suppliers worldwide</p>
              </div>
              <Card>
                <CardContent className="p-8 text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Marketplace Coming Soon</h3>
                  <p className="text-gray-600">Browse products, discover suppliers, and expand your sourcing network.</p>
                </CardContent>
              </Card>
            </div>
          )}

          {currentView === 'compliance' && (
            <ComplianceDashboard />
          )}

          {currentView === 'logistics' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Logistics & Shipping</h1>
                <p className="text-gray-600">Track shipments and manage logistics operations</p>
              </div>
              <Card>
                <CardContent className="p-8 text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Logistics Management</h3>
                  <p className="text-gray-600">Real-time shipment tracking, delivery scheduling, and logistics optimization.</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-800 text-white p-2 text-center text-sm">
        <div className="container mx-auto flex justify-between items-center">
          <span>FoodXchange Platform v2.0 - Professional B2B Food Commerce</span>
          <div className="flex gap-4">
            <span>Backend: {apiResponse ? 'Connected' : 'Check Status'}</span>
            <span>Compliance: Active</span>
            <span>User: demo@foodxchange.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;