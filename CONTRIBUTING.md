# Contributing to AI API Playground

Thank you for your interest in contributing to the AI API Playground! This document provides guidelines and instructions for contributing to the project.

## 🎯 Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect different viewpoints and experiences
- Show empathy towards other community members

## 🤝 How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

- **Clear title** describing the problem
- **Detailed description** of the issue
- **Steps to reproduce** the bug
- **Expected behavior** vs **actual behavior**
- **Environment details** (OS, Node version, browser, etc.)
- **Screenshots** if applicable
- **Error logs** if available

### Suggesting Features

We welcome feature suggestions! Please create an issue with:

- **Clear title** describing the feature
- **Detailed description** of the proposed feature
- **Use cases** and **benefits**
- **Possible implementation** approach (if you have ideas)
- **Mockups** or **examples** if applicable

### Pull Requests

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/ai-api-playground.git`
3. **Create a branch**: `git checkout -b feature/amazing-feature`
4. **Make your changes**
5. **Test your changes** thoroughly
6. **Commit** your changes: `git commit -m 'feat: add amazing feature'`
7. **Push** to your fork: `git push origin feature/amazing-feature`
8. **Create a Pull Request** against the `main` branch

## 🛠️ Development Setup

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm (v8.0.0 or higher) or yarn
- MongoDB (v4.4 or higher)
- Redis (v6.0 or higher)
- Git

### Setup Steps

1. **Fork and clone** the repository
2. **Install dependencies**:
   ```bash
   cd backend && npm install
   cd frontend && npm install
   ```
3. **Set up environment files**:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
4. **Configure environment variables** (see [Quick Start Guide](QUICK_START.md))
5. **Start development servers**:
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend
   cd frontend && npm start
   ```

## 📋 Development Guidelines

### Code Style

#### Backend (Node.js/Express)

We use ESLint with Airbnb configuration:

```bash
# Check code style
cd backend && npm run lint

# Fix auto-fixable issues
cd backend && npm run lint:fix
```

**Key Rules:**
- Use 2 spaces for indentation
- Use single quotes for strings
- Use camelCase for variables and functions
- Use PascalCase for classes
- Use UPPER_SNAKE_CASE for constants
- Always use strict mode (`'use strict';`)
- Use async/await instead of callbacks
- Add JSDoc comments for functions
- Maximum line length: 100 characters

**Example:**
```javascript
/**
 * Authenticates a user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Authentication result
 */
const login = async (email, password) => {
  // Implementation
};
```

#### Frontend (React/TypeScript)

We use ESLint with React hooks rules:

```bash
# Check code style
cd frontend && npm run lint

# Fix auto-fixable issues
cd frontend && npm run lint:fix
```

**Key Rules:**
- Use 2 spaces for indentation
- Use single quotes for strings
- Use camelCase for variables and functions
- Use PascalCase for components and interfaces
- Use TypeScript for type safety
- Use functional components with hooks
- Use CSS Modules for styling
- Maximum line length: 100 characters

**Example:**
```typescript
import React, { useState, useEffect } from 'react';
import styles from './Component.module.css';

interface UserProps {
  id: string;
  name: string;
  email: string;
}

const UserComponent: React.FC<UserProps> = ({ id, name, email }) => {
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    // Component logic
  }, [id]);
  
  return (
    <div className={styles.container}>
      <h1>{name}</h1>
      <p>{email}</p>
    </div>
  );
};

export default UserComponent;
```

### Git Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(auth): add password reset functionality
fix(api): resolve rate limiting issue
docs(readme): update installation instructions
style(frontend): format code with prettier
refactor(services): extract common AI logic
test(backend): add unit tests for auth service
chore(deps): update dependencies
```

### Branch Naming

Use descriptive branch names:

- `feature/add-oauth-login`
- `bugfix/fix-rate-limiting`
- `docs/update-api-documentation`
- `refactor/optimize-database-queries`

### File Organization

#### Backend Structure
```
backend/src/
├── config/         # Configuration files
├── middleware/     # Express middleware
├── models/         # MongoDB models
├── routes/         # API routes
├── services/       # Business logic
├── utils/          # Utility functions
└── app.js          # Main application file
```

#### Frontend Structure
```
frontend/src/
├── components/     # Reusable components
├── context/        # React context providers
├── hooks/          # Custom hooks
├── pages/          # Page components
├── services/       # API clients
├── utils/          # Utility functions
└── App.tsx         # Main application component
```

## 🧪 Testing

### Backend Testing

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test auth.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should login"
```

**Test Structure:**
```javascript
describe('Auth Service', () => {
  describe('login', () => {
    it('should login with valid credentials', async () => {
      // Test implementation
    });
    
    it('should fail with invalid credentials', async () => {
      // Test implementation
    });
  });
});
```

### Frontend Testing

```bash
cd frontend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

**Test Structure:**
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import LoginForm from './LoginForm';

describe('LoginForm', () => {
  it('should render login form', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
  
  it('should handle form submission', () => {
    // Test implementation
  });
});
```

### Test Coverage Requirements

- **Backend**: Minimum 80% coverage
- **Frontend**: Minimum 70% coverage
- **Critical paths**: 100% coverage (auth, payment, etc.)

## 📚 Documentation

### Code Documentation

- Add JSDoc comments for all functions
- Document complex algorithms
- Include usage examples
- Document edge cases and error handling

**Example:**
```javascript
/**
 * Calculates the cost of AI API usage
 * @param {number} tokens - Number of tokens used
 * @param {string} model - AI model used
 * @param {string} provider - AI provider
 * @returns {number} Cost in USD
 * @throws {Error} If model or provider is invalid
 * 
 * @example
 * const cost = calculateCost(1000, 'gpt-3.5-turbo', 'openai');
 * console.log(cost); // 0.002
 */
const calculateCost = (tokens, model, provider) => {
  // Implementation
};
```

### API Documentation

- Update API documentation for new endpoints
- Include request/response examples
- Document authentication requirements
- Document error responses

### README Updates

- Update README.md for new features
- Update installation instructions if needed
- Add new environment variables to configuration section

## 🔒 Security Guidelines

### Sensitive Data

- Never commit secrets or credentials
- Use environment variables for configuration
- Implement proper input validation
- Use parameterized queries to prevent SQL injection
- Sanitize user inputs to prevent XSS

### Authentication & Authorization

- Always validate JWT tokens
- Implement proper role-based access control
- Use HTTPS in production
- Implement rate limiting
- Log security events

### Dependencies

- Keep dependencies updated
- Audit dependencies for vulnerabilities
- Use `npm audit` regularly
- Pin dependency versions in production

## 🚀 Deployment

### Pre-deployment Checklist

- [ ] All tests pass
- [ ] Code coverage meets requirements
- [ ] Linting passes with no errors
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Security audit passed
- [ ] Documentation updated
- [ ] Version bumped appropriately

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

**Examples:**
- `1.0.0` - Initial release
- `1.1.0` - New features added
- `1.1.1` - Bug fix
- `2.0.0` - Breaking changes

## 📊 Performance Guidelines

### Backend Performance

- Use database indexes appropriately
- Implement caching for frequently accessed data
- Optimize database queries
- Use connection pooling
- Monitor memory usage
- Implement request timeout

### Frontend Performance

- Use React.memo for expensive components
- Implement lazy loading for routes
- Optimize images and assets
- Use code splitting
- Minimize bundle size
- Implement proper caching strategies

## 🎨 UI/UX Guidelines

### Design Principles

- **Consistency**: Use consistent patterns and components
- **Accessibility**: Follow WCAG 2.1 guidelines
- **Responsiveness**: Support all screen sizes
- **Performance**: Optimize for fast loading
- **Intuitiveness**: Make interfaces self-explanatory

### Color Palette

- **Primary**: `#007bff` (Bootstrap primary)
- **Success**: `#28a745`
- **Warning**: `#ffc107`
- **Danger**: `#dc3545`
- **Info**: `#17a2b8`

### Typography

- **Headings**: System font stack
- **Body**: System font stack
- **Code**: Monospace font stack

## 🐛 Debugging

### Backend Debugging

```bash
# Enable debug mode
DEBUG=ai-api-playground:* npm run dev

# Node.js inspector
node --inspect src/app.js
```

### Frontend Debugging

```bash
# React Developer Tools
# Install browser extension

# Redux DevTools (if using Redux)
# Install browser extension
```

### Common Issues

1. **Port already in use**: Change PORT in .env
2. **Database connection failed**: Check MongoDB is running
3. **Redis connection failed**: Check Redis is running
4. **CORS issues**: Check CORS_ORIGIN in backend .env
5. **JWT errors**: Check JWT_SECRET is set

## 🤝 Getting Help

### Before Asking for Help

1. Check the documentation
2. Search existing issues
3. Check the troubleshooting guide
4. Try to reproduce the issue
5. Gather relevant logs and error messages

### How to Ask for Help

When creating an issue:

1. **Describe the problem** clearly
2. **Provide context** (what you're trying to achieve)
3. **Include error messages** and logs
4. **Share your environment** (OS, Node version, etc.)
5. **Show what you've tried** already

## 🏆 Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes
- Project documentation
- Special thanks in project announcements

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You!

Thank you for contributing to the AI API Playground! Your contributions help make this project better for everyone.

---

**Contributing Guide** | Version 1.0.0 | Last Updated: November 11, 2025

For questions or suggestions about this guide, please open an issue on GitHub.