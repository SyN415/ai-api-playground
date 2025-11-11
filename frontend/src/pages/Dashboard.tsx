import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import MinimaxTester from '../components/MinimaxTester';
import './Dashboard.css';

export const Dashboard: React.FC = () => {
  const { user, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1>Welcome back, {user?.name || 'User'}!</h1>
          <p>Your AI video generation playground</p>
        </div>
        <div className="user-info">
          <div className="api-key-status">
            {user?.apiKey ? (
              <span className="status-active">API Key Active</span>
            ) : (
              <span className="status-inactive">No API Key</span>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="quick-actions">
          <h2>Quick Actions</h2>
          <div className="action-cards">
            <Link to="/playground" className="action-card">
              <div className="action-icon">🎬</div>
              <h3>Generate Video</h3>
              <p>Create AI-powered videos with Minimax</p>
            </Link>
            
            <Link to="/analytics" className="action-card">
              <div className="action-icon">📊</div>
              <h3>View Analytics</h3>
              <p>Check your usage and costs</p>
            </Link>
            
            <Link to="/api-keys" className="action-card">
              <div className="action-icon">🔑</div>
              <h3>Manage API Keys</h3>
              <p>Configure your API access</p>
            </Link>
            
            {user?.role === 'admin' && (
              <Link to="/admin" className="action-card admin">
                <div className="action-icon">⚙️</div>
                <h3>Admin Panel</h3>
                <p>Manage users and system settings</p>
              </Link>
            )}
          </div>
        </div>

        <div className="recent-activity">
          <h2>Recent Activity</h2>
          <MinimaxTester className="compact" />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;