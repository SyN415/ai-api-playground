export const validators = {
  email: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  password: (password: string): boolean => {
    return password.length >= 6;
  },

  apiKey: (apiKey: string): boolean => {
    return apiKey.length >= 10 && /^[a-zA-Z0-9-_]+$/.test(apiKey);
  },

  url: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  required: (value: string): boolean => {
    return value.trim().length > 0;
  },

  number: (value: string): boolean => {
    return !isNaN(Number(value)) && value.trim() !== '';
  },

  positiveNumber: (value: string): boolean => {
    const num = Number(value);
    return !isNaN(num) && num > 0;
  },

  json: (value: string): boolean => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }
};

export default validators;