import { Request, Response, NextFunction } from 'express';
import { centralPrisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { matchModule, MODULES } from '../config/modules';
import { isStaffOrAdmin } from './maintenanceHelpers';
import { recordAudit } from '../services/audit.service';
import { getIO } from '../socket';

interface ModuleState {
  enabled: boolean;
  message?: string;
  estimatedFinish?: string;
  auto?: boolean;      // true = do circuit breaker tự bật (được phép tự khôi phục)
  tripAt?: string;     // thời điểm auto-trip (để tính cooldown half-open)
}

// Ngưỡng circuit breaker
const CB_THRESHOLD = Number(process.env.CB_ERROR_THRESHOLD || 5); // số lỗi 500
const CB_WINDOW = Number(process.env.CB_WINDOW_SEC || 60);        // trong bao nhiêu giây

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

/**
 * Circuit breaker: đếm lỗi 500 của module trong cửa sổ trượt (fixed window Redis).
 * Vượt ngưỡng → tự bật bảo trì (auto=true) + audit + socket alert.
 * KHÔNG đếm 503-maintenance (chỉ đếm 500 từ handler thật) → không tự kích hoạt lẫn nhau.
 */
export async function recordModuleError(moduleKey: string): Promise<void> {
  const key = `cb:err:${moduleKey}`;
  let count = 0;
  try {
    count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, CB_WINDOW);
  } catch {
    return; // redis down → tắt breaker, không brick
  }
  if (count < CB_THRESHOLD) return;

  const state = await getModuleState(moduleKey);
  if (state.enabled) return; // đã bật rồi (thủ công hoặc auto) → thôi

  await setModuleState(moduleKey, {
    enabled: true,
    auto: true,
    tripAt: new Date().toISOString(),
    message: 'Chức năng tạm dừng tự động do phát hiện lỗi hệ thống. Đang khôi phục...',
  });
  try { await redisClient.del(key); } catch { /* ignore */ }

  const label = MODULES.find((m) => m.key === moduleKey)?.label || moduleKey;
  recordAudit({
    action: 'MODULE_AUTO_MAINTENANCE_TRIPPED',
    adminId: 'system',
    actorName: 'Circuit Breaker',
    targetType: 'MODULE',
    targetId: moduleKey,
    reason: `Tự bật bảo trì: ${count} lỗi 500 trong ${CB_WINDOW}s (module ${label})`,
  });
  try { getIO().emit('MODULE_AUTO_MAINTENANCE', { module: moduleKey, tripped: true, label }); } catch { /* socket chưa init */ }
  console.warn(`[CircuitBreaker] Auto-bật bảo trì module "${moduleKey}" (${count} lỗi 500/${CB_WINDOW}s)`);
}

/**
 * Half-open recovery: sau cooldown, tắt bảo trì các module do breaker tự bật (auto=true)
 * → cho traffic chảy lại. Nếu vẫn lỗi, recordModuleError sẽ tự re-trip. Tránh kẹt bảo trì.
 * KHÔNG đụng module admin bật thủ công (auto=false).
 */
export async function recoverAutoModules(): Promise<void> {
  const cooldownMs = Number(process.env.CB_COOLDOWN_SEC || 180) * 1000;
  for (const m of MODULES) {
    const state = await getModuleState(m.key);
    if (state.enabled && state.auto && state.tripAt) {
      if (Date.now() - new Date(state.tripAt).getTime() > cooldownMs) {
        await setModuleState(m.key, { enabled: false, auto: false });
        recordAudit({
          action: 'MODULE_AUTO_MAINTENANCE_RECOVERED',
          adminId: 'system',
          actorName: 'Circuit Breaker',
          targetType: 'MODULE',
          targetId: m.key,
          reason: 'Hết cooldown → mở lại thử (half-open)',
        });
        try { getIO().emit('MODULE_AUTO_MAINTENANCE', { module: m.key, tripped: false, label: m.label }); } catch { /* ignore */ }
        console.log(`[CircuitBreaker] Half-open: mở lại module "${m.key}" sau cooldown`);
      }
    }
  }
}

/** Middleware: chặn customer-facing request của module đang bảo trì; nhân viên/admin bypass. */
export const moduleMaintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mod = matchModule(req.method, req.path);
    if (!mod) return next(); // request không thuộc entry-point nào bị quản

    const state = await getModuleState(mod.key);

    if (state.enabled) {
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
    }

    // Không bảo trì → cho qua, nhưng theo dõi lỗi 500 để circuit breaker tự bật
    res.on('finish', () => {
      if (res.statusCode === 500) recordModuleError(mod.key).catch(() => {});
    });
    return next();
  } catch (error) {
    console.error('[ModuleMaintenance] Error:', error);
    return next(); // không brick nếu lỗi
  }
};
