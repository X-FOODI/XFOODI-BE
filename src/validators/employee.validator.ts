import { ValidationResult } from './category.validator';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const ALLOWED_ROLES = ['Owner', 'Waiter', 'Kitchen Staff', 'Kitchen', 'Cashier'];
const ALLOWED_STATUS = ['ACTIVE', 'INACTIVE'];

function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (!password) {
    errors.push('Mật khẩu là bắt buộc.');
    return errors;
  }
  if (password.length < 8) {
    errors.push('Mật khẩu phải dài ít nhất 8 ký tự.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Mật khẩu phải chứa ít nhất một chữ cái viết hoa.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Mật khẩu phải chứa ít nhất một chữ cái viết thường.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Mật khẩu phải chứa ít nhất một chữ số.');
  }
  return errors;
}

export function validateCreateEmployee(body: any): ValidationResult {
  const errors: string[] = [];

  if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length === 0) {
    errors.push('Họ và tên là bắt buộc.');
  }

  if (!body.username || typeof body.username !== 'string' || body.username.trim().length === 0) {
    errors.push('Tên tài khoản là bắt buộc.');
  } else if (body.username.trim().length < 3) {
    errors.push('Tên tài khoản phải dài ít nhất 3 ký tự.');
  }

  if (!body.email || !EMAIL_REGEX.test(body.email.trim())) {
    errors.push('Định dạng email không hợp lệ.');
  }

  if (body.phone && typeof body.phone === 'string' && body.phone.trim().length > 0) {
    const phoneRegex = /^[0-9+() -]+$/;
    if (!phoneRegex.test(body.phone.trim())) {
      errors.push('Số điện thoại không hợp lệ.');
    }
  }

  // Password checks
  const pwdErrors = validatePassword(body.password);
  errors.push(...pwdErrors);

  if (body.password !== body.confirmPassword) {
    errors.push('Mật khẩu xác nhận không khớp.');
  }

  // Role checks
  if (!body.role || !ALLOWED_ROLES.includes(body.role)) {
    errors.push(`Vai trò không hợp lệ. Cho phép: ${ALLOWED_ROLES.join(', ')}`);
  }

  if (!body.position || typeof body.position !== 'string' || body.position.trim().length === 0) {
    errors.push('Chức vụ là bắt buộc.');
  }

  if (!body.status || !ALLOWED_STATUS.includes(body.status)) {
    errors.push('Trạng thái không hợp lệ.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateUpdateEmployee(body: any): ValidationResult {
  const errors: string[] = [];

  if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length === 0) {
    errors.push('Họ và tên là bắt buộc.');
  }

  if (!body.email || !EMAIL_REGEX.test(body.email.trim())) {
    errors.push('Định dạng email không hợp lệ.');
  }

  if (body.phone && typeof body.phone === 'string' && body.phone.trim().length > 0) {
    const phoneRegex = /^[0-9+() -]+$/;
    if (!phoneRegex.test(body.phone.trim())) {
      errors.push('Số điện thoại không hợp lệ.');
    }
  }

  if (!body.role || !ALLOWED_ROLES.includes(body.role)) {
    errors.push(`Vai trò không hợp lệ. Cho phép: ${ALLOWED_ROLES.join(', ')}`);
  }

  if (!body.position || typeof body.position !== 'string' || body.position.trim().length === 0) {
    errors.push('Chức vụ là bắt buộc.');
  }

  if (!body.status || !ALLOWED_STATUS.includes(body.status)) {
    errors.push('Trạng thái không hợp lệ.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateResetPassword(body: any): ValidationResult {
  const errors: string[] = [];
  const pwdErrors = validatePassword(body.newPassword);
  errors.push(...pwdErrors);
  return { valid: errors.length === 0, errors };
}
