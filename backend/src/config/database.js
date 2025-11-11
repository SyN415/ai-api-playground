const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.supabase = null;
    this.initialized = false;
  }

  /**
   * Initialize Supabase client
   */
  initialize() {
    if (this.initialized) {
      return this.supabase;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and key must be provided in environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      }
    });

    this.initialized = true;
    logger.info('Supabase client initialized successfully');
    return this.supabase;
  }

  /**
   * Get Supabase client instance
   */
  getClient() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.supabase;
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const client = this.getClient();
      const { data, error } = await client.from('users').select('count').limit(1);
      
      if (error) {
        logger.error('Database connection test failed:', error);
        throw error;
      }
      
      logger.info('Database connection test successful');
      return true;
    } catch (error) {
      logger.error('Database connection test failed:', error);
      throw error;
    }
  }

  /**
   * Execute raw SQL query
   * @param {string} sql - SQL query string
   * @param {object} params - Query parameters
   */
  async query(sql, params = {}) {
    try {
      const client = this.getClient();
      const { data, error } = await client.rpc('exec_sql', { sql, params });
      
      if (error) {
        logger.error('SQL query execution failed:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      logger.error('SQL query execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute SQL file
   * @param {string} sqlContent - SQL file content
   */
  async executeSqlFile(sqlContent) {
    try {
      const client = this.getClient();
      const { error } = await client.rpc('exec_sql', { sql: sqlContent });
      
      if (error) {
        logger.error('SQL file execution failed:', error);
        throw error;
      }
      
      logger.info('SQL file executed successfully');
      return true;
    } catch (error) {
      logger.error('SQL file execution failed:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
const db = new Database();
module.exports = db;