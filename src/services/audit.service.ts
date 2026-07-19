import { centralPrisma } from '../lib/prisma';

export interface AuditRecordInput {
  action: string;
  adminId: string;
  targetId?: string;
  targetType?: string;
  actorEmail?: string | null;
  actorName?: string | null;
  method?: string | null;
  path?: string | null;
  ipAddress?: string | null;
  status?: 'SUCCESS' | 'FAILED';
  reason?: string | null;
  metadata?: any;
}

/**
 * Ghi 1 bản ghi audit vào DB (bảng AuditLogs).
 * Best-effort: mọi lỗi được nuốt để không bao giờ làm hỏng request chính.
 */
export async function recordAudit(input: AuditRecordInput): Promise<void> {
  try {
    await centralPrisma.auditLog.create({
      data: {
        action: input.action,
        adminId: input.adminId,
        targetId: input.targetId ?? '',
        targetType: input.targetType ?? null,
        actorEmail: input.actorEmail ?? null,
        actorName: input.actorName ?? null,
        method: input.method ?? null,
        path: input.path ?? null,
        ipAddress: input.ipAddress ?? null,
        status: input.status ?? 'SUCCESS',
        reason: input.reason ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (err: any) {
    console.warn('[AuditService] Không ghi được audit log:', err?.message);
  }
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  action?: string;
  adminId?: string;
  targetType?: string;
  targetId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
}

/** Truy vấn audit logs có phân trang + lọc (admin only). */
export async function queryAuditLogs(q: AuditQuery) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (q.action) where.action = q.action;
  if (q.adminId) where.adminId = q.adminId;
  if (q.targetType) where.targetType = q.targetType;
  if (q.targetId) where.targetId = q.targetId;
  if (q.status) where.status = q.status;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt.gte = new Date(q.from);
    if (q.to) where.createdAt.lte = new Date(q.to);
  }
  if (q.search) {
    const s = q.search.trim();
    where.OR = [
      { action: { contains: s, mode: 'insensitive' } },
      { actorEmail: { contains: s, mode: 'insensitive' } },
      { actorName: { contains: s, mode: 'insensitive' } },
      { reason: { contains: s, mode: 'insensitive' } },
      { targetId: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    centralPrisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    centralPrisma.auditLog.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** Danh sách các action đã từng xuất hiện (cho dropdown filter). */
export async function listAuditActions(): Promise<string[]> {
  const rows = await centralPrisma.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  });
  return rows.map((r) => r.action);
}
