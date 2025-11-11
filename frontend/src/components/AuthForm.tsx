import React, { useState } from 'react';
import { LoginCredentials, RegisterCredentials } from '../services/auth';
import { validators } from '../utils/validators';
import './AuthForm.css';

export interface AuthFormProps {
  mode: 'login' | 'register';
  onSubmit: (data: LoginCredentials | RegisterCredentials) => void;
  error?: string | null;
  loading?: boolean;
}

export const AuthForm: React.FC<AuthFormProps> = ({ mode, onSubmit, error, loading = false }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!validators.required(formData.email)) {
      errors.email = 'Email is required';
    } else if (!validators.email(formData.email)) {
      errors.email = 'Invalid email format';
    }

    if (!validators.required(formData.password)) {
      errors.password = 'Password is required';
    } else if (mode === 'register' && !validators.password(formData.password)) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (mode === 'register' && !validators.required(formData.name)) {
      errors.name = 'Name is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      if (mode === 'login') {
        onSubmit({
          email: formData.email,
          password: formData.password,
        } as LoginCredentials);
      } else {
        onSubmit({
          email: formData.email,
          password: formData.password,
          name: formData.name,
        } as RegisterCredentials);
      }
    }
  };

  const getInputClassName = (fieldName: string): string => {
    const baseClass = 'form-input';
    if (validationErrors[fieldName]) {
      return `${baseClass} error`;
    }
    return baseClass;
  };

  return (
    <div className="auth-form-container">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2 className="auth-form-title">
          {mode === 'login' ? 'Login' : 'Register'}
        </h2>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        {mode === 'register' && (
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={getInputClassName('name')}
              disabled={loading}
              required
            />
            {validationErrors.name && (
              <span className="error-message">{validationErrors.name}</span>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={getInputClassName('email')}
            disabled={loading}
            required
          />
          {validationErrors.email && (
            <span className="error-message">{validationErrors.email}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className={getInputClassName('password')}
            disabled={loading}
            required
          />
          {validationErrors.password && (
            <span className="error-message">{validationErrors.password}</span>
          )}
          {mode === 'register' && (
            <p className="password-hint">Password must be at least 6 characters</p>
          )}
        </div>

        <button
          type="submit"
          className="auth-submit-button"
          disabled={loading}
        >
          {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Register'}
        </button>
      </form>
    </div>
  );
};

export default AuthForm;