// Configuration for different environments
const config = {
  development: {
    API_BASE_URL: 'http://127.0.0.1:3001',
    SOCKET_URL: 'http://127.0.0.1:3001'
  },
  production: {
    API_BASE_URL: 'https://your-render-backend-url.onrender.com',
    SOCKET_URL: 'https://your-render-backend-url.onrender.com'
  }
};

// Determine environment
const isDevelopment = import.meta.env.DEV;
const environment = isDevelopment ? 'development' : 'production';

// Export current environment config
export const API_BASE_URL = config[environment].API_BASE_URL;
export const SOCKET_URL = config[environment].SOCKET_URL;

export default config[environment];
