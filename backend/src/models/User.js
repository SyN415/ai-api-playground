const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../utils/logger');

class User {
  constructor(data = {}) {
    this.id = data.id || null;
    this.email = data.email || '';
    this.password_hash = data.password_hash || '';
    this.role = data.role || 'user';
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.is_email_verified = data.is_email_verified !== undefined ? data.is_email_verified : false;
    this.last_login = data.last_login || null;
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.password_reset_token = data.password_reset_token || null;
    this.password_reset_expires = data.password_reset_expires || null;
    this.email_verification_token = data.email_verification_token || null;
  }

  /**
   * Hash password using bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password) {
    try {
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      logger.debug('Password hashed successfully');
      return hashedPassword;
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Compare plain password with hashed password
   * @param {string} password - Plain text password
   * @param {string} hashedPassword - Hashed password
   * @returns {Promise<boolean>} True if passwords match
   */
  static async comparePassword(password, hashedPassword) {
    try {
      const isMatch = await bcrypt.compare(password, hashedPassword);
      logger.debug('Password comparison completed');
      return isMatch;
    } catch (error) {
      logger.error('Password comparison failed:', error);
      throw new Error('Password comparison failed');
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with isValid and errors array
   */
  static validatePassword(password) {
    const errors = [];
    
    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/(?=.*[!@#$%^&*])/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<User>} Created user instance
   */
  static async create(userData) {
    try {
      const { email, password, role = 'user' } = userData;
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }
      
      // Check if user already exists
      const existingUser = await this.findByEmail(email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }
      
      // Validate password strength
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.isValid) {
        throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }
      
      // Hash password
      const passwordHash = await this.hashPassword(password);
      
      // Create user in database
      const client = db.getClient();
      const { data, error } = await client
        .from('users')
        .insert([{
          email: email.toLowerCase().trim(),
          password_hash: passwordHash,
          role,
          is_active: true,
          is_email_verified: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        logger.error('User creation failed:', error);
        throw new Error(`User creation failed: ${error.message}`);
      }
      
      logger.info(`User created successfully: ${data.email}`);
      return new User(data);
    } catch (error) {
      logger.error('User creation error:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<User|null>} User instance or null
   */
  static async findByEmail(email) {
    try {
      const client = db.getClient();
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .single();
      
      if (error && error.code !== 'PGRST116') {
        logger.error('Database error in findByEmail:', error);
        throw new Error(`Database error: ${error.message}`);
      }
      
      return data ? new User(data) : null;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Promise<User|null>} User instance or null
   */
  static async findById(id) {
    try {
      const client = db.getClient();
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        logger.error('Database error in findById:', error);
        throw new Error(`Database error: ${error.message}`);
      }
      
      return data ? new User(data) : null;
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  /**
   * Update user last login timestamp
   * @returns {Promise<void>}
   */
  async updateLastLogin() {
    try {
      const client = db.getClient();
      const { error } = await client
        .from('users')
        .update({ 
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);
      
      if (error) {
        logger.error('Failed to update last login:', error);
        throw new Error(`Failed to update last login: ${error.message}`);
      }
      
      this.last_login = new Date().toISOString();
      logger.info(`Last login updated for user: ${this.email}`);
    } catch (error) {
      logger.error('Error updating last login:', error);
      throw error;
    }
  }

  /**
   * Update user password
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  async updatePassword(newPassword) {
    try {
      // Validate password strength
      const passwordValidation = User.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }
      
      // Hash new password
      const passwordHash = await User.hashPassword(newPassword);
      
      const client = db.getClient();
      const { error } = await client
        .from('users')
        .update({ 
          password_hash: passwordHash,
          password_reset_token: null,
          password_reset_expires: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);
      
      if (error) {
        logger.error('Failed to update password:', error);
        throw new Error(`Failed to update password: ${error.message}`);
      }
      
      this.password_hash = passwordHash;
      this.password_reset_token = null;
      this.password_reset_expires = null;
      logger.info(`Password updated for user: ${this.email}`);
    } catch (error) {
      logger.error('Error updating password:', error);
      throw error;
    }
  }

  /**
   * Set password reset token
   * @param {string} token - Reset token
   * @param {Date} expires - Expiration date
   * @returns {Promise<void>}
   */
  async setPasswordResetToken(token, expires) {
    try {
      const client = db.getClient();
      const { error } = await client
        .from('users')
        .update({ 
          password_reset_token: token,
          password_reset_expires: expires.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);
      
      if (error) {
        logger.error('Failed to set password reset token:', error);
        throw new Error(`Failed to set password reset token: ${error.message}`);
      }
      
      this.password_reset_token = token;
      this.password_reset_expires = expires.toISOString();
      logger.info(`Password reset token set for user: ${this.email}`);
    } catch (error) {
      logger.error('Error setting password reset token:', error);
      throw error;
    }
  }

  /**
   * Verify password reset token
   * @param {string} token - Token to verify
   * @returns {Promise<boolean>} True if token is valid
   */
  async verifyPasswordResetToken(token) {
    if (!this.password_reset_token || !this.password_reset_expires) {
      return false;
    }
    
    if (this.password_reset_token !== token) {
      return false;
    }
    
    const now = new Date();
    const expires = new Date(this.password_reset_expires);
    
    return now < expires;
  }

  /**
   * Update account status
   * @param {boolean} isActive - New active status
   * @returns {Promise<void>}
   */
  async updateAccountStatus(isActive) {
    try {
      const client = db.getClient();
      const { error } = await client
        .from('users')
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);
      
      if (error) {
        logger.error('Failed to update account status:', error);
        throw new Error(`Failed to update account status: ${error.message}`);
      }
      
      this.is_active = isActive;
      logger.info(`Account status updated for user: ${this.email}, active: ${isActive}`);
    } catch (error) {
      logger.error('Error updating account status:', error);
      throw error;
    }
  }

  /**
   * Verify user email
   * @returns {Promise<void>}
   */
  async verifyEmail() {
    try {
      const client = db.getClient();
      const { error } = await client
        .from('users')
        .update({ 
          is_email_verified: true,
          email_verification_token: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);
      
      if (error) {
        logger.error('Failed to verify email:', error);
        throw new Error(`Failed to verify email: ${error.message}`);
      }
      
      this.is_email_verified = true;
      this.email_verification_token = null;
      logger.info(`Email verified for user: ${this.email}`);
    } catch (error) {
      logger.error('Error verifying email:', error);
      throw error;
    }
  }

  /**
   * Sanitize user data for public response
   * @returns {Object} Sanitized user data
   */
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      is_active: this.is_active,
      is_email_verified: this.is_email_verified,
      last_login: this.last_login,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Check if user has specific role
   * @param {string} role - Role to check
   * @returns {boolean} True if user has role
   */
  hasRole(role) {
    return this.role === role;
  }

  /**
   * Check if user has any of the specified roles
   * @param {Array<string>} roles - Roles to check
   * @returns {boolean} True if user has any of the roles
   */
  hasAnyRole(roles) {
    return roles.includes(this.role);
  }
}

module.exports = User;