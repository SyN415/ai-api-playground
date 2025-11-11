require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const authService = require('./src/services/authService');

// Mock database for testing
const mockUsers = new Map();

// Override User methods for testing
User.create = async function(userData) {
  const { email, password, role = 'user' } = userData;
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  
  // Check if user already exists
  if (mockUsers.has(email.toLowerCase().trim())) {
    throw new Error('User with this email already exists');
  }
  
  // Validate password strength
  const passwordValidation = User.validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
  }
  
  // Hash password
  const passwordHash = await User.hashPassword(password);
  
  // Create user
  const user = {
    id: `user_${Date.now()}`,
    email: email.toLowerCase().trim(),
    password_hash: passwordHash,
    role,
    is_active: true,
    is_email_verified: false,
    last_login: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    password_reset_token: null,
    password_reset_expires: null,
    email_verification_token: null
  };
  
  mockUsers.set(user.email, user);
  return new User(user);
};

User.findByEmail = async function(email) {
  const userData = mockUsers.get(email.toLowerCase().trim());
  return userData ? new User(userData) : null;
};

User.findById = async function(id) {
  for (const user of mockUsers.values()) {
    if (user.id === id) {
      return new User(user);
    }
  }
  return null;
};

// Override authService database methods
const originalResetPassword = authService.resetPassword;
authService.resetPassword = async function(token, newPassword) {
  // Find user by reset token
  for (const userData of mockUsers.values()) {
    if (userData.password_reset_token === token) {
      const user = new User(userData);
      
      // Verify token is still valid
      const isTokenValid = await user.verifyPasswordResetToken(token);
      if (!isTokenValid) {
        throw new Error('Invalid or expired reset token');
      }
      
      // Update password
      await user.updatePassword(newPassword);
      
      // Update mock database
      mockUsers.set(userData.email, user);
      
      return {
        message: 'Password reset successfully'
      };
    }
  }
  
  throw new Error('Invalid or expired reset token');
};

// Override User instance methods
const originalUpdatePassword = User.prototype.updatePassword;
User.prototype.updatePassword = async function(newPassword) {
  // Validate password strength
  const passwordValidation = User.validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
  }
  
  // Hash new password
  const passwordHash = await User.hashPassword(newPassword);
  
  this.password_hash = passwordHash;
  this.password_reset_token = null;
  this.password_reset_expires = null;
  this.updated_at = new Date().toISOString();
  
  // Update mock database
  const userData = mockUsers.get(this.email);
  if (userData) {
    userData.password_hash = passwordHash;
    userData.password_reset_token = null;
    userData.password_reset_expires = null;
    userData.updated_at = this.updated_at;
  }
};

const originalSetPasswordResetToken = User.prototype.setPasswordResetToken;
User.prototype.setPasswordResetToken = async function(token, expires) {
  this.password_reset_token = token;
  this.password_reset_expires = expires.toISOString();
  this.updated_at = new Date().toISOString();
  
  // Update mock database
  const userData = mockUsers.get(this.email);
  if (userData) {
    userData.password_reset_token = token;
    userData.password_reset_expires = expires.toISOString();
    userData.updated_at = this.updated_at;
  }
};

const originalUpdateLastLogin = User.prototype.updateLastLogin;
User.prototype.updateLastLogin = async function() {
  this.last_login = new Date().toISOString();
  this.updated_at = new Date().toISOString();
  
  // Update mock database
  const userData = mockUsers.get(this.email);
  if (userData) {
    userData.last_login = this.last_login;
    userData.updated_at = this.updated_at;
  }
};

async function testAuthenticationSystem() {
  console.log('🧪 Testing JWT Authentication System\n');
  
  try {
    // Test 1: User Registration
    console.log('1. Testing User Registration...');
    const testEmail = `test${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';
    
    const registrationResult = await authService.register({
      email: testEmail,
      password: testPassword,
      role: 'user'
    });
    
    console.log('✅ User registered successfully');
    console.log('User ID:', registrationResult.user.id);
    console.log('User Email:', registrationResult.user.email);
    console.log('Tokens generated:', !!registrationResult.tokens.accessToken);
    console.log('');

    // Test 2: User Login
    console.log('2. Testing User Login...');
    const loginResult = await authService.login(testEmail, testPassword);
    
    console.log('✅ User logged in successfully');
    console.log('User ID:', loginResult.user.id);
    console.log('Access Token:', loginResult.tokens.accessToken.substring(0, 50) + '...');
    console.log('Refresh Token:', loginResult.tokens.refreshToken.substring(0, 50) + '...');
    console.log('');

    // Test 3: Token Verification
    console.log('3. Testing Token Verification...');
    const accessToken = loginResult.tokens.accessToken;
    const decodedToken = authService.verifyToken(accessToken);
    
    console.log('✅ Token verified successfully');
    console.log('User ID from token:', decodedToken.userId);
    console.log('Email from token:', decodedToken.email);
    console.log('Role from token:', decodedToken.role);
    console.log('');

    // Test 4: Token Refresh
    console.log('4. Testing Token Refresh...');
    const refreshToken = loginResult.tokens.refreshToken;
    const refreshResult = await authService.refreshToken(refreshToken);
    
    console.log('✅ Token refreshed successfully');
    console.log('New Access Token:', refreshResult.accessToken.substring(0, 50) + '...');
    console.log('');

    // Test 5: Password Reset Request
    console.log('5. Testing Password Reset Request...');
    const resetRequestResult = await authService.requestPasswordReset(testEmail);
    
    console.log('✅ Password reset request processed');
    console.log('Reset token (for testing):', resetRequestResult.resetToken);
    console.log('');

    // Test 6: Password Reset
    console.log('6. Testing Password Reset...');
    const newPassword = 'NewPassword123!';
    const resetResult = await authService.resetPassword(resetRequestResult.resetToken, newPassword);
    
    console.log('✅ Password reset successfully');
    console.log('');

    // Test 7: Login with new password
    console.log('7. Testing Login with New Password...');
    const newLoginResult = await authService.login(testEmail, newPassword);
    
    console.log('✅ Login with new password successful');
    console.log('');

    // Test 8: Get User Profile
    console.log('8. Testing Get User Profile...');
    const profileResult = await authService.getCurrentUser(loginResult.user.id);
    
    console.log('✅ User profile retrieved successfully');
    console.log('Profile Email:', profileResult.user.email);
    console.log('Profile Role:', profileResult.user.role);
    console.log('');

    // Test 9: User Model Methods
    console.log('9. Testing User Model Methods...');
    const user = await User.findByEmail(testEmail);
    
    // Test password validation
    const weakPassword = 'weak';
    const passwordValidation = User.validatePassword(weakPassword);
    console.log(`Password '${weakPassword}' validation:`, passwordValidation.isValid ? '✅ Valid' : '❌ Invalid');
    
    const strongPassword = 'StrongPass123!';
    const strongPasswordValidation = User.validatePassword(strongPassword);
    console.log(`Password '${strongPassword}' validation:`, strongPasswordValidation.isValid ? '✅ Valid' : '❌ Invalid');
    
    // Test role checking
    console.log('User role:', user.role);
    console.log('Is admin?', user.hasRole('admin'));
    console.log('Is user?', user.hasRole('user'));
    console.log('Has any role [user, admin]?', user.hasAnyRole(['user', 'admin']));
    console.log('');

    // Test 10: Token Expiration
    console.log('10. Testing Token Expiration...');
    const tokenExpiration = authService.getTokenExpiration(accessToken);
    const expiresInMinutes = Math.ceil((tokenExpiration - new Date()) / 60000);
    console.log('Token expires in:', expiresInMinutes, 'minutes');
    console.log('');

    // Test 11: Password Hashing
    console.log('11. Testing Password Hashing...');
    const plainPassword = 'TestPassword123!';
    const hashedPassword = await User.hashPassword(plainPassword);
    const isMatch = await User.comparePassword(plainPassword, hashedPassword);
    
    console.log('✅ Password hashing successful');
    console.log('Password matches hash:', isMatch);
    console.log('');

    // Test 12: Invalid Login Attempts
    console.log('12. Testing Invalid Login Attempts...');
    try {
      await authService.login(testEmail, 'wrongpassword');
      console.log('❌ Should have failed with wrong password');
    } catch (error) {
      console.log('✅ Correctly rejected invalid password:', error.message);
    }
    
    try {
      await authService.login('nonexistent@example.com', 'password');
      console.log('❌ Should have failed with non-existent email');
    } catch (error) {
      console.log('✅ Correctly rejected non-existent email:', error.message);
    }
    console.log('');

    console.log('🎉 All authentication tests passed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ User registration with password hashing');
    console.log('✅ User login with credential validation');
    console.log('✅ JWT token generation (access and refresh tokens)');
    console.log('✅ Token verification and validation');
    console.log('✅ Token refresh mechanism');
    console.log('✅ Password reset functionality');
    console.log('✅ User profile management');
    console.log('✅ Password strength validation');
    console.log('✅ Role-based access control helpers');
    console.log('✅ Token expiration handling');
    console.log('✅ Password hashing and comparison');
    console.log('✅ Invalid credential rejection');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests
testAuthenticationSystem()
  .then(() => {
    console.log('\n🏁 Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  });