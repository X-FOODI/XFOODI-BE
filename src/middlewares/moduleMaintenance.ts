import { Request, Response, NextFunction } from 'express';
import { centralPrisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { matchModule, MODULES } from '../config/modules';
import { isStaffOrAdmin } from './maintenanceHelpers';

interface ModuleState {
  enabled: boolean;
  message?: string;
  estimatedFinish?: string;
}

const CACHE_TTL = 60;
const settingKey = (moduleKey: string) => `moduleMaintenance.${moduleKey}`;
const cacheKey = (moduleKey: string) => `mmt:${moduleKey}`;

/** Đọc trạng thái 1 module (Redis → DB fallback, cache 60s). */
export async function getModuleState(moduleKey: string): Promise<ModuleState> {
  try {
    const cached = await redisClient.get(cacheKey(moduleKey));
    if (cached !== null) return JSON.parse(cached);
  } catch {
    /* redis down */
  }
  let state: ModuleState = { enabled: false };
  try {
    const row = await centralPrisma.systemSetting.findFirst({ where: { key: settingKey(moduleKey) } });
    if (row?.value) state = JSON.parse(row.value);
  } catch {
    /* DB lỗi → coi như không bảo trì để không brick */
  }
  try {
    await redisClient.setEx(cacheKey(moduleKey), CACHE_TTL, JSON.stringify(state));
  } catch {
    /* redis down */
  }
  return state;
}

/** Ghi trạng thái 1 module (upsert 1 key riêng → không race) + xóa cache. */
export async function setModuleState(moduleKey: string, state: ModuleState): Promise<void> {
  const key = settingKey(moduleKey);
  const value = JSON.stringify(state);
  const existing = await centralPrisma.systemSetting.findFirst({ where: { key } });
  if (existing) {
    await centralPrisma.systemSetting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await centralPrisma.systemSetting.create({ data: { key, value } });
  }
  try {
    await redisClient.del(cacheKey(moduleKey));
  } catch {
    /* redis down */
  }
}

/** Trạng thái tất cả module (cho admin + public status). */
export async function getAllModuleStates(): Promise<Array<{ key: string; label: string; state: ModuleState }>> {
  const results = await Promise.all(
    MODULES.map(async (m) => ({ key: m.key, label: m.label, state: await getModuleState(m.key) })),
  );
  return results;
}

/** Middleware: chặn customer-facing request của module đang bảo trì; nhân viên/admin bypass. */
export const moduleMaintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mod = matchModule(req.method, req.path);
    if (!mod) return next(); // request không thuộc entry-point nào bị quản

    const state = await getModuleState(mod.key);
    if (!state.enabled) return next();

    // Nhân viên/chủ nhà hàng hoặc platform-admin → bypass (chỉ khách/ẩn danh bị chặn)
    if (isStaffOrAdmin(req)) return next();

    return res.status(503).json({
      success: false,
      isMaintenance: true,
      scope: 'module',
      module: mod.key,
      message: state.message || `Chức năng "${mod.label}" đang được bảo trì. Vui lòng quay lại sau.`,
      estimatedFinish: state.estimatedFinish || '',
    });
  } catch (error) {
    console.error('[ModuleMaintenance] Error:', error);
    return next(); // không brick nếu lỗi
  }
};
