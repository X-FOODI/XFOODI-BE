export const API_ROUTES = {
  AUTH: {
    BASE: '/api/auth',
    LOGIN: '/login',
    GOOGLE: '/google',
    REGISTER: '/register',
    REFRESH_TOKEN: '/refresh-token',
    LOGOUT: '/logout',
    ME: '/me',
    RESEND_CONFIRMATION_EMAIL: '/resend-confirmation-email',
    CONFIRM_EMAIL: '/confirm-email',
  },
  USERS: {
    BASE: '/api/users',
    ME: '/me',
    CHANGE_PASSWORD: '/change-password',
  },
  TENANTS: {
    BASE: '/api/tenants',
  },
  HEALTH: {
    BASE: '/api/health',
  }
};
