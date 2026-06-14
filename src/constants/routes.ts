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
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',
  },
  USERS: {
    BASE: '/api/users',
    ME: '/me',
    CHANGE_PASSWORD: '/change-password',
  },
  EMPLOYEES: {
    BASE: '/api/employees',
  },
  TENANTS: {
    BASE: '/api/tenants',
  },
  RESTAURANT_APPLICATIONS: {
    BASE: '/api/restaurant-applications',
    MY: '/my',                // GET  - customer xem đơn của mình
    LIST: '/',                // GET  - admin xem tất cả
    CREATE: '/',              // POST - customer tạo đơn
    DETAIL: '/:id',           // GET  - admin xem chi tiết
    APPROVE: '/:id/approve',  // POST - admin duyệt
    REJECT: '/:id/reject',    // POST - admin từ chối
  },
  HEALTH: {
    BASE: '/api/health',
  },
  CATEGORIES: {
    BASE: '/api/categories',
  },
  DISHES: {
    BASE: '/api/dishes',
  },
};
