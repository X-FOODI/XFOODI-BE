import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export const PLATFORM_ADMIN_ROLES = ['Admin', 'SuperAdmin', 'System Admin'];
// Vai trò vận hành của chính nhà hàng — được bypass module maintenance
export const STAFF_ROLES = ['Owner', 'Manager', 'Waiter', 'Kitchen Staff', 'Cashier'];

export function decodeRolesFromReq(req: any): string[] {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return [];
  try {
    const decoded: any = jwt.verify(authHeader.split(' ')[1], ENV.JWT.ACCESS_SECRET);
    return decoded.roles || (decoded.role ? [decoded.role] : []);
  } catch {
    return [];
  }
}

/** Chỉ platform-admin (dùng cho global maintenance bypass). */
export function isPlatformAdmin(req: any): boolean {
  return decodeRolesFromReq(req).some((r) => PLATFORM_ADMIN_ROLES.includes(r));
}

/** Nhân viên/chủ nhà hàng HOẶC platform-admin — bypass module maintenance (chỉ khách/ẩn danh bị chặn). */
export function isStaffOrAdmin(req: any): boolean {
  const roles = decodeRolesFromReq(req);
  return roles.some((r) => PLATFORM_ADMIN_ROLES.includes(r) || STAFF_ROLES.includes(r));
}
