import { centralPrisma } from '../lib/prisma';

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  level?: string; // INFO | WARNING | CRITICAL
  createdBy?: string;
  actorName?: string | null;
  expiresAt?: string | null;
}

export async function createAnnouncement(input: CreateAnnouncementInput) {
  return centralPrisma.announcement.create({
    data: {
      title: input.title,
      content: input.content,
      level: input.level || 'INFO',
      createdBy: input.createdBy ?? null,
      actorName: input.actorName ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
}

export async function listAnnouncements(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    centralPrisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
    centralPrisma.announcement.count(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** Các thông báo còn hiệu lực (đang bật + chưa hết hạn) — cho tenant/user đọc. */
export async function listActiveAnnouncements() {
  const now = new Date();
  return centralPrisma.announcement.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function setAnnouncementActive(id: string, isActive: boolean) {
  return centralPrisma.announcement.update({ where: { id }, data: { isActive } });
}

export async function deleteAnnouncement(id: string) {
  return centralPrisma.announcement.delete({ where: { id } });
}
