import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';
import './Login.css';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, error, clearError, isLoading } = useAuthContext();

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (credentials: any) => {
    clearError();
    const response = await login(credentials);
    if (response.success) {
      navigate('/dashboard');
    }
  };

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>AI API Playground</h1>
          <p>Login to access AI-powered video generation tools</p>
        </div>
        
        <AuthForm
          mode="login"
          onSubmit={handleLogin}
          error={error}
          loading={isLoading}
        />
        
        <div className="login-footer">
          <p>
            Don't have an account? <Link to="/register">Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;