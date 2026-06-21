import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { getIO } from '../socket';
import { randomUUID } from 'crypto';
import { getCloudinary, isCloudinaryConfigured } from '../lib/cloudinary';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env';

/** RestX-compatible enum: 0 = Available, 1 = Occupied */
export enum TableStatusEnum {
  Available = 0,
  Occupied = 1,
}

function statusCodeToEnum(code: string): TableStatusEnum {
  return code === 'OCCUPIED' ? TableStatusEnum.Occupied : TableStatusEnum.Available;
}

function enumToStatusCode(statusId: number): string {
  return statusId === TableStatusEnum.Occupied ? 'OCCUPIED' : 'AVAILABLE';
}

async function uploadImageToCloudinary(
  buffer: Buffer,
  folder: string,
  publicId: string
): Promise<string> {
  const saveLocally = () => {
    try {
      const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sanitizedPublicId = publicId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedFolder}_${sanitizedPublicId}_${Date.now()}.jpg`;
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, buffer);
      console.log(`[Upload Fallback] Saved image locally to ${filepath}`);
      const baseUrl = ENV.API_URL ? ENV.API_URL.replace('/api', '') : 'http://localhost:5000';
      return `${baseUrl}/uploads/${filename}`;
    } catch (err: any) {
      console.error('[Upload Fallback] Failed to save image locally:', err);
      throw new TableServiceError(500, `Local image save failed: ${err.message}`);
    }
  };

  if (!isCloudinaryConfigured()) {
    console.warn('[Upload] Cloudinary is not configured. Falling back to local file storage.');
    return saveLocally();
  }

  try {
    const cloudinary = getCloudinary();
    return await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, public_id: publicId, resource_type: 'image', overwrite: true },
        (error, result) => {
          if (error || !result?.secure_url) {
            reject(error ?? new Error('Cloudinary upload returned no URL'));
            return;
          }
          resolve(result.secure_url);
        }
      );
      stream.end(buffer);
    });
  } catch (error: any) {
    console.warn(`[Upload] Cloudinary upload failed: ${error.message || error}. Falling back to local file storage.`);
    return saveLocally();
  }
}

export function mapTableToItem(t: {
  id: string;
  code: string;
  type: string;
  seatingCapacity: number;
  shape: string;
  positionX: Prisma.Decimal | number;
  positionY: Prisma.Decimal | number;
  width: Prisma.Decimal | number;
  height: Prisma.Decimal | number;
  rotation: Prisma.Decimal | number;
  floorId: string;
  has3DView?: boolean;
  viewDescription?: string | null;
  defaultViewUrl?: string | null;
  qrCodeUrl?: string | null;
  isActive: boolean;
  cubeFrontImageUrl?: string | null;
  cubeBackImageUrl?: string | null;
  cubeLeftImageUrl?: string | null;
  cubeRightImageUrl?: string | null;
  cubeTopImageUrl?: string | null;
  cubeBottomImageUrl?: string | null;
  tableStatus?: { code: string; name: string } | null;
  floor?: { name: string } | null;
}) {
  const statusCode = t.tableStatus?.code ?? 'AVAILABLE';
  return {
    id: t.id,
    code: t.code,
    type: t.type,
    seatingCapacity: t.seatingCapacity,
    shape: t.shape,
    positionX: Number(t.positionX),
    positionY: Number(t.positionY),
    width: Number(t.width),
    height: Number(t.height),
    rotation: Number(t.rotation),
    floorId: t.floorId,
    floorName: t.floor?.name ?? '',
    tableStatusId: statusCodeToEnum(statusCode),
    tableStatusName: t.tableStatus?.name ?? statusCode,
    has3DView: t.has3DView ?? false,
    viewDescription: t.viewDescription ?? undefined,
    defaultViewUrl: t.defaultViewUrl ?? undefined,
    qrCodeUrl: t.qrCodeUrl ?? undefined,
    cubeFrontImageUrl: t.cubeFrontImageUrl ?? undefined,
    cubeBackImageUrl: t.cubeBackImageUrl ?? undefined,
    cubeLeftImageUrl: t.cubeLeftImageUrl ?? undefined,
    cubeRightImageUrl: t.cubeRightImageUrl ?? undefined,
    cubeTopImageUrl: t.cubeTopImageUrl ?? undefined,
    cubeBottomImageUrl: t.cubeBottomImageUrl ?? undefined,
    isActive: t.isActive,
  };
}

export class TableServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'TableServiceError';
    Object.setPrototypeOf(this, TableServiceError.prototype);
  }
}

// Helper: Ensure TABLE status type and values exist in the database schema.
// Returns a map of code -> statusValueId
async function ensureTableStatuses(restaurantId: string): Promise<Record<string, string>> {
  // Check if status type 'TABLE' exists
  let statusType = await prisma.statusType.findUnique({
    where: { code: 'TABLE' },
  });

  if (!statusType) {
    statusType = await prisma.statusType.create({
      data: { code: 'TABLE' },
    });
  }

  const defaultStatuses = [
    { code: 'AVAILABLE', name: 'Available', colorCode: '#2ecc71', isDefault: true },
    { code: 'OCCUPIED', name: 'Occupied', colorCode: '#e74c3c', isDefault: false },
    { code: 'RESERVED', name: 'Reserved', colorCode: '#f1c40f', isDefault: false },
  ];

  const map: Record<string, string> = {};

  for (const s of defaultStatuses) {
    let statusValue = await prisma.statusValue.findFirst({
      where: {
        statusTypeId: statusType.id,
        code: s.code,
      },
    });

    if (!statusValue) {
      statusValue = await prisma.statusValue.create({
        data: {
          statusTypeId: statusType.id,
          code: s.code,
          name: s.name,
          colorCode: s.colorCode,
          isDefault: s.isDefault,
          isSystem: true,
        },
      });
    }

    map[s.code] = statusValue.id;
  }

  return map;
}

// Helper: Broadcast table status change via Socket.io
function broadcastTableUpdate(restaurantId: string, event: string, payload: any) {
  try {
    const io = getIO();
    io.to(`restaurant_${restaurantId}`).emit(event, payload);
  } catch (error) {
    console.warn('[TableService] Socket.io not ready or broadcast failed:', error);
  }
}

// ─── Floor Operations ─────────────────────────────────────────────────────────

export async function listFloors(restaurantId: string) {
  const floors = await prisma.floor.findMany({
    where: { restaurantId, isActive: true },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { tables: { where: { isActive: true } } } },
    },
  });
  return floors.map((f) => ({
    id: f.id,
    name: f.name,
    width: Number(f.width) || 1400,
    height: Number(f.height) || 900,
    imageUrl: f.imageUrl ?? undefined,
    tableCount: f._count.tables,
    isActive: f.isActive,
  }));
}

export async function createFloor(
  restaurantId: string,
  data: { name: string; imageUrl?: string; width?: number; height?: number; imageBuffer?: Buffer; imageName?: string }
) {
  const floorId = randomUUID();
  let imageUrl = data.imageUrl || null;

  if (data.imageBuffer) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
    const folder = `xfoodi/${restaurant?.slug ?? restaurantId}/floors`;
    imageUrl = await uploadImageToCloudinary(data.imageBuffer, folder, floorId);
  }

  const newFloor = await prisma.floor.create({
    data: {
      id: floorId,
      name: data.name.trim(),
      restaurantId,
      imageUrl,
      width: new Prisma.Decimal(data.width ?? 1400),
      height: new Prisma.Decimal(data.height ?? 900),
      isActive: true,
    },
  });

  broadcastTableUpdate(restaurantId, 'FLOOR_LAYOUT_CHANGED', { floorId: newFloor.id });
  return { id: newFloor.id, name: newFloor.name, width: Number(newFloor.width), height: Number(newFloor.height), imageUrl: newFloor.imageUrl };
}

export async function updateFloor(
  restaurantId: string,
  id: string,
  data: { name?: string; imageUrl?: string; width?: number; height?: number; isActive?: boolean; imageBuffer?: Buffer; imageName?: string }
) {
  const existing = await prisma.floor.findFirst({
    where: { id, restaurantId },
  });

  if (!existing) {
    throw new TableServiceError(404, 'Floor not found');
  }

  let imageUrl = data.imageUrl;
  if (data.imageBuffer) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
    const folder = `xfoodi/${restaurant?.slug ?? restaurantId}/floors`;
    imageUrl = await uploadImageToCloudinary(data.imageBuffer, folder, id);
  }

  const updated = await prisma.floor.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(data.width !== undefined && { width: new Prisma.Decimal(data.width) }),
      ...(data.height !== undefined && { height: new Prisma.Decimal(data.height) }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  broadcastTableUpdate(restaurantId, 'FLOOR_LAYOUT_CHANGED', { floorId: id });
  return updated;
}

export async function deleteFloor(restaurantId: string, id: string) {
  const existing = await prisma.floor.findFirst({
    where: { id, restaurantId },
  });

  if (!existing) {
    throw new TableServiceError(404, 'Floor not found');
  }

  // Check if floor has tables
  const tableCount = await prisma.table.count({
    where: { floorId: id, isActive: true },
  });

  if (tableCount > 0) {
    throw new TableServiceError(400, 'Cannot delete floor: it still has active tables. Please remove/reassign tables first.');
  }

  await prisma.floor.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function getFloorLayout(restaurantId: string, floorId: string) {
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, restaurantId, isActive: true },
  });

  if (!floor) {
    throw new TableServiceError(404, 'Floor not found');
  }

  const tables = await prisma.table.findMany({
    where: { floorId, restaurantId, isActive: true },
    include: {
      tableStatus: {
        select: { code: true, name: true, colorCode: true },
      },
      sessions: {
        where: { isActive: true },
        include: {
          order: {
            select: {
              id: true,
              reference: true,
              totalAmount: true,
            },
          },
        },
      },
    },
  });

  return {
    floor,
    tables: tables.map(t => {
      const activeSession = t.sessions[0] || null;
      return {
        id: t.id,
        code: t.code,
        seatingCapacity: t.seatingCapacity,
        type: t.type,
        shape: t.shape,
        positionX: Number(t.positionX),
        positionY: Number(t.positionY),
        width: Number(t.width),
        height: Number(t.height),
        rotation: Number(t.rotation),
        qrCodeUrl: t.qrCodeUrl,
        status: t.tableStatus.code,
        statusName: t.tableStatus.name,
        statusColor: t.tableStatus.colorCode,
        activeSession: activeSession ? {
          id: activeSession.id,
          startedAt: activeSession.startedAt,
          order: activeSession.order,
        } : null,
      };
    }),
  };
}

export async function updateFloorLayout(
  restaurantId: string,
  floorId: string,
  layoutData: Array<{ id: string; positionX: number; positionY: number; width?: number; height?: number; rotation?: number }>
) {
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, restaurantId, isActive: true },
  });

  if (!floor) {
    throw new TableServiceError(404, 'Floor not found');
  }

  // Update layout in a transaction
  await prisma.$transaction(
    layoutData.map(t =>
      prisma.table.update({
        where: { id: t.id, floorId, restaurantId },
        data: {
          positionX: new Prisma.Decimal(t.positionX),
          positionY: new Prisma.Decimal(t.positionY),
          ...(t.width !== undefined && { width: new Prisma.Decimal(t.width) }),
          ...(t.height !== undefined && { height: new Prisma.Decimal(t.height) }),
          ...(t.rotation !== undefined && { rotation: new Prisma.Decimal(t.rotation) }),
        },
      })
    )
  );

  broadcastTableUpdate(restaurantId, 'FLOOR_LAYOUT_CHANGED', { floorId });

  return { success: true };
}

// ─── Table Operations ─────────────────────────────────────────────────────────

export async function listTables(restaurantId: string, floorId?: string) {
  const where: any = { restaurantId, isActive: true };
  if (floorId) {
    where.floorId = floorId;
  }

  const tables = await prisma.table.findMany({
    where,
    include: {
      tableStatus: {
        select: { code: true, name: true, colorCode: true },
      },
      floor: {
        select: { name: true },
      },
    },
    orderBy: { code: 'asc' },
  });

  return tables.map((t) => mapTableToItem(t));
}

export async function createTable(
  restaurantId: string,
  data: {
    code: string;
    seatingCapacity: number;
    type: string;
    shape: string;
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
    rotation?: number;
    floorId: string;
  }
) {
  // Verify floor exists
  const floor = await prisma.floor.findFirst({
    where: { id: data.floorId, restaurantId, isActive: true },
  });

  if (!floor) {
    throw new TableServiceError(404, 'Target Floor not found or inactive');
  }

  // Check code uniqueness (both active and inactive to prevent database unique constraint violations)
  const duplicate = await prisma.table.findFirst({
    where: { code: data.code.trim(), restaurantId },
  });

  if (duplicate) {
    if (duplicate.isActive) {
      throw new TableServiceError(409, `Table with code "${data.code}" already exists in this restaurant`);
    } else {
      // Free up the code of the inactive (soft-deleted) table by appending a unique suffix
      await prisma.table.update({
        where: { id: duplicate.id },
        data: { code: `${duplicate.code}_deleted_${Date.now()}` },
      });
    }
  }

  const isDeco = data.code.trim().startsWith('DECO_');
  if (!isDeco && data.seatingCapacity < 1) {
    throw new TableServiceError(400, 'Seating capacity must be at least 1');
  }

  const statusMap = await ensureTableStatuses(restaurantId);
  const availableStatusId = statusMap['AVAILABLE'];

  const tableId = randomUUID();
  const newTable = await prisma.table.create({
    data: {
      id: tableId,
      code: data.code.trim(),
      restaurantId,
      floorId: data.floorId,
      seatingCapacity: isDeco ? 0 : data.seatingCapacity,
      type: data.type,
      shape: data.shape,
      positionX: new Prisma.Decimal(data.positionX ?? 0),
      positionY: new Prisma.Decimal(data.positionY ?? 0),
      width: new Prisma.Decimal(data.width ?? 60),
      height: new Prisma.Decimal(data.height ?? 60),
      rotation: new Prisma.Decimal(data.rotation ?? 0),
      tableStatusId: availableStatusId,
      isActive: true,
      qrCodeUrl: `/menu/${tableId}`,
    },
  });

  broadcastTableUpdate(restaurantId, 'TABLE_CREATED', { tableId: newTable.id, floorId: data.floorId });

  const withRelations = await prisma.table.findUniqueOrThrow({
    where: { id: newTable.id },
    include: {
      tableStatus: { select: { code: true, name: true } },
      floor: { select: { name: true } },
    },
  });
  return mapTableToItem(withRelations);
}

export async function updateTable(
  restaurantId: string,
  id: string,
  data: {
    code?: string;
    seatingCapacity?: number;
    type?: string;
    shape?: string;
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
    rotation?: number;
    floorId?: string;
    status?: string;
    tableStatusId?: number;
    isActive?: boolean;
    has3DView?: boolean;
    viewDescription?: string;
    defaultViewUrl?: string;
    qrCodeUrl?: string;
    cubeFrontImageUrl?: string;
    cubeBackImageUrl?: string;
    cubeLeftImageUrl?: string;
    cubeRightImageUrl?: string;
    cubeTopImageUrl?: string;
    cubeBottomImageUrl?: string;
    clearCubemap?: boolean;
    cubeFrontImageBuffer?: Buffer;
    cubeBackImageBuffer?: Buffer;
    cubeLeftImageBuffer?: Buffer;
    cubeRightImageBuffer?: Buffer;
    cubeTopImageBuffer?: Buffer;
    cubeBottomImageBuffer?: Buffer;
    [key: string]: any;
  }
) {
  const existing = await prisma.table.findFirst({
    where: { id, restaurantId, isActive: true },
  });

  if (!existing) {
    throw new TableServiceError(404, 'Table not found');
  }

  const updateData: any = {};

  if (data.code !== undefined) {
    const trimmedCode = data.code.trim();
    if (trimmedCode !== existing.code) {
      const duplicate = await prisma.table.findFirst({
        where: { code: trimmedCode, restaurantId, id: { not: id } },
      });
      if (duplicate) {
        if (duplicate.isActive) {
          throw new TableServiceError(409, `Table with code "${trimmedCode}" already exists`);
        } else {
          // Free up the code of the inactive duplicate
          await prisma.table.update({
            where: { id: duplicate.id },
            data: { code: `${duplicate.code}_deleted_${Date.now()}` },
          });
        }
      }
    }
    updateData.code = trimmedCode;
    updateData.qrCodeUrl = `/menu/${id}`;
  }

  if (data.floorId !== undefined) {
    const floor = await prisma.floor.findFirst({
      where: { id: data.floorId, restaurantId, isActive: true },
    });
    if (!floor) {
      throw new TableServiceError(404, 'Target Floor not found or inactive');
    }
    updateData.floorId = data.floorId;
  }

  if (data.seatingCapacity !== undefined) updateData.seatingCapacity = data.seatingCapacity;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.shape !== undefined) updateData.shape = data.shape;
  if (data.positionX !== undefined) updateData.positionX = new Prisma.Decimal(data.positionX);
  if (data.positionY !== undefined) updateData.positionY = new Prisma.Decimal(data.positionY);
  if (data.width !== undefined) updateData.width = new Prisma.Decimal(data.width);
  if (data.height !== undefined) updateData.height = new Prisma.Decimal(data.height);
  if (data.rotation !== undefined) updateData.rotation = new Prisma.Decimal(data.rotation);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.has3DView !== undefined) updateData.has3DView = data.has3DView;
  if (data.viewDescription !== undefined) updateData.viewDescription = data.viewDescription || null;
  if (data.defaultViewUrl !== undefined) updateData.defaultViewUrl = data.defaultViewUrl || null;
  if (data.qrCodeUrl !== undefined) updateData.qrCodeUrl = data.qrCodeUrl || null;

  if (data.clearCubemap) {
    updateData.cubeFrontImageUrl = null;
    updateData.cubeBackImageUrl = null;
    updateData.cubeLeftImageUrl = null;
    updateData.cubeRightImageUrl = null;
    updateData.cubeTopImageUrl = null;
    updateData.cubeBottomImageUrl = null;
    updateData.has3DView = false;
    updateData.defaultViewUrl = null;
  } else {
    // Process the 6 faces of the cubemap if they are uploaded
    const faces = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'];
    const uploadedUrls: Record<string, string> = {};
    
    for (const face of faces) {
      const bufferKey = `cube${face}ImageBuffer`;
      const buffer = data[bufferKey];
      if (buffer) {
        const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
        const folder = `xfoodi/${restaurant?.slug ?? restaurantId}/tableCube`;
        const url = await uploadImageToCloudinary(buffer, folder, `${face}_${id}`);
        updateData[`cube${face}ImageUrl`] = url;
        uploadedUrls[face] = url;
      }
    }

    if (Object.keys(uploadedUrls).length > 0) {
      updateData.has3DView = true;
      if (uploadedUrls.Front && !existing.defaultViewUrl) {
        updateData.defaultViewUrl = uploadedUrls.Front;
      }
    }

    // Direct URL updates (for manual / other API clients)
    if (data.cubeFrontImageUrl !== undefined) updateData.cubeFrontImageUrl = data.cubeFrontImageUrl || null;
    if (data.cubeBackImageUrl !== undefined) updateData.cubeBackImageUrl = data.cubeBackImageUrl || null;
    if (data.cubeLeftImageUrl !== undefined) updateData.cubeLeftImageUrl = data.cubeLeftImageUrl || null;
    if (data.cubeRightImageUrl !== undefined) updateData.cubeRightImageUrl = data.cubeRightImageUrl || null;
    if (data.cubeTopImageUrl !== undefined) updateData.cubeTopImageUrl = data.cubeTopImageUrl || null;
    if (data.cubeBottomImageUrl !== undefined) updateData.cubeBottomImageUrl = data.cubeBottomImageUrl || null;
  }

  if (data.tableStatusId !== undefined) {
    const statusMap = await ensureTableStatuses(restaurantId);
    const code = enumToStatusCode(data.tableStatusId);
    const statusId = statusMap[code];
    if (statusId) updateData.tableStatusId = statusId;
  } else if (data.status !== undefined) {
    const statusMap = await ensureTableStatuses(restaurantId);
    const statusId = statusMap[data.status.toUpperCase()];
    if (!statusId) {
      throw new TableServiceError(400, `Invalid table status "${data.status}"`);
    }
    updateData.tableStatusId = statusId;
  }

  try {
    const updated = await prisma.table.update({
      where: { id },
      data: updateData,
      include: {
        tableStatus: {
          select: { code: true, name: true, colorCode: true },
        },
        floor: { select: { name: true } },
      },
    });

    const payload = {
      tableId: updated.id,
      floorId: updated.floorId,
      code: updated.code,
      status: updated.tableStatus.code,
    };

    broadcastTableUpdate(restaurantId, 'TABLE_UPDATED', payload);

    return mapTableToItem(updated);
  } catch (error) {
    console.error("CHI TIẾT LỖI DATABASE:", error);
    throw error;
  }
}

export async function deleteTable(restaurantId: string, id: string) {
  const existing = await prisma.table.findFirst({
    where: { id, restaurantId, isActive: true },
  });

  if (!existing) {
    throw new TableServiceError(404, 'Table not found');
  }

  // Check for active sessions
  const activeSessionCount = await prisma.tableSession.count({
    where: { tableId: id, isActive: true },
  });

  if (activeSessionCount > 0) {
    throw new TableServiceError(400, 'Cannot delete table: it currently has an active session.');
  }

  await prisma.table.update({
    where: { id },
    data: { 
      isActive: false,
      code: `${existing.code}_deleted_${Date.now()}`,
    },
  });

  broadcastTableUpdate(restaurantId, 'TABLE_DELETED', { tableId: id, floorId: existing.floorId });
}

/**
 * Bulk delete multiple tables at once.
 * Tables with active sessions are skipped (not deleted) and reported back.
 * Returns a summary: { deleted, skipped, failed }
 */
export async function bulkDeleteTables(
  restaurantId: string,
  ids: string[]
): Promise<{ deleted: string[]; skipped: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const id of ids) {
    try {
      const existing = await prisma.table.findFirst({
        where: { id, restaurantId, isActive: true },
      });

      if (!existing) {
        failed.push(id);
        continue;
      }

      // Skip tables that currently have an active session
      const activeSessionCount = await prisma.tableSession.count({
        where: { tableId: id, isActive: true },
      });

      if (activeSessionCount > 0) {
        skipped.push(existing.code);
        continue;
      }

      await prisma.table.update({
        where: { id },
        data: {
          isActive: false,
          code: `${existing.code}_deleted_${Date.now()}`,
        },
      });

      deleted.push(id);
    } catch (err) {
      console.error(`[bulkDeleteTables] Failed to delete table ${id}:`, err);
      failed.push(id);
    }
  }

  // Broadcast a single bulk-delete event if anything was deleted
  if (deleted.length > 0) {
    broadcastTableUpdate(restaurantId, 'TABLE_DELETED', { tableIds: deleted });
  }

  return { deleted, skipped, failed };
}

// ─── Table Session Operations ──────────────────────────────────────────────────

export async function createTableSession(restaurantId: string, tableId: string, orderId?: string) {
  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId, isActive: true },
    include: { tableStatus: true },
  });

  if (!table) {
    throw new TableServiceError(404, 'Table not found');
  }

  // Check if there is already an active session
  const existingSession = await prisma.tableSession.findFirst({
    where: { tableId, isActive: true },
  });

  if (existingSession) {
    return existingSession;
  }

  const statusMap = await ensureTableStatuses(restaurantId);
  const occupiedStatusId = statusMap['OCCUPIED'];

  // Start transaction
  const session = await prisma.$transaction(async (tx) => {
    // 1. Create session
    const newSession = await tx.tableSession.create({
      data: {
        tableId,
        orderId: orderId || null,
        startedAt: new Date(),
        isActive: true,
      },
    });

    // 2. Set Table status to Occupied
    await tx.table.update({
      where: { id: tableId },
      data: { tableStatusId: occupiedStatusId },
    });

    return newSession;
  });

  broadcastTableUpdate(restaurantId, 'TABLE_SESSION_STARTED', {
    tableId,
    sessionId: session.id,
    orderId,
    status: 'OCCUPIED',
  });

  return session;
}

export async function mergeTableSessions(restaurantId: string, sourceTableId: string, targetTableId: string) {
  // Find active sessions for both tables
  const sourceSession = await prisma.tableSession.findFirst({
    where: { tableId: sourceTableId, isActive: true },
  });

  const targetSession = await prisma.tableSession.findFirst({
    where: { tableId: targetTableId, isActive: true },
  });

  if (!sourceSession) {
    throw new TableServiceError(400, 'Source table does not have an active session');
  }

  if (!targetSession) {
    throw new TableServiceError(400, 'Target table does not have an active session');
  }

  // Merge: Target table session will be merged into source table session's order (or vice versa)
  // Typically, we attach the target session's order to the source session, or set targetSession order to sourceSession order
  const orderId = sourceSession.orderId || targetSession.orderId;

  if (!orderId) {
    throw new TableServiceError(400, 'At least one session must be associated with an order to merge');
  }

  const statusMap = await ensureTableStatuses(restaurantId);
  const occupiedStatusId = statusMap['OCCUPIED'];

  await prisma.$transaction(async (tx) => {
    // Link both sessions to the same order
    await tx.tableSession.update({
      where: { id: sourceSession.id },
      data: { orderId },
    });

    await tx.tableSession.update({
      where: { id: targetSession.id },
      data: { orderId },
    });

    // Ensure both are set to occupied
    await tx.table.update({
      where: { id: sourceTableId },
      data: { tableStatusId: occupiedStatusId },
    });

    await tx.table.update({
      where: { id: targetTableId },
      data: { tableStatusId: occupiedStatusId },
    });
  });

  broadcastTableUpdate(restaurantId, 'TABLE_SESSIONS_MERGED', {
    sourceTableId,
    targetTableId,
    orderId,
  });

  return { success: true, orderId };
}

export async function transferTableSession(restaurantId: string, fromTableId: string, toTableId: string) {
  const activeSession = await prisma.tableSession.findFirst({
    where: { tableId: fromTableId, isActive: true },
  });

  if (!activeSession) {
    throw new TableServiceError(400, 'No active session found on the source table');
  }

  // Check if target table is busy
  const targetSession = await prisma.tableSession.findFirst({
    where: { tableId: toTableId, isActive: true },
  });

  if (targetSession) {
    throw new TableServiceError(400, 'Target table already has an active session');
  }

  const statusMap = await ensureTableStatuses(restaurantId);
  const availableStatusId = statusMap['AVAILABLE'];
  const occupiedStatusId = statusMap['OCCUPIED'];

  await prisma.$transaction(async (tx) => {
    // 1. Move session to target table
    await tx.tableSession.update({
      where: { id: activeSession.id },
      data: { tableId: toTableId },
    });

    // 2. Set source table to AVAILABLE
    await tx.table.update({
      where: { id: fromTableId },
      data: { tableStatusId: availableStatusId },
    });

    // 3. Set target table to OCCUPIED
    await tx.table.update({
      where: { id: toTableId },
      data: { tableStatusId: occupiedStatusId },
    });
  });

  broadcastTableUpdate(restaurantId, 'TABLE_SESSION_TRANSFERRED', {
    fromTableId,
    toTableId,
    sessionId: activeSession.id,
    orderId: activeSession.orderId,
  });

  return { success: true };
}

export async function closeTableSession(restaurantId: string, tableId: string) {
  const activeSession = await prisma.tableSession.findFirst({
    where: { tableId, isActive: true },
  });

  if (!activeSession) {
    throw new TableServiceError(404, 'No active session found on this table');
  }

  const statusMap = await ensureTableStatuses(restaurantId);
  const availableStatusId = statusMap['AVAILABLE'];

  await prisma.$transaction(async (tx) => {
    // 1. End session
    await tx.tableSession.update({
      where: { id: activeSession.id },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    // 2. Set Table status to Available
    await tx.table.update({
      where: { id: tableId },
      data: { tableStatusId: availableStatusId },
    });
  });

  broadcastTableUpdate(restaurantId, 'TABLE_SESSION_CLOSED', {
    tableId,
    sessionId: activeSession.id,
    status: 'AVAILABLE',
  });

  return { success: true };
}

export async function closeTableSessions(restaurantId: string, tableIds: string[]) {
  const normalized = [...new Set(tableIds.filter(Boolean))];
  if (normalized.length === 0) {
    throw new TableServiceError(400, 'TableIds is required');
  }

  for (const tableId of normalized) {
    const activeSession = await prisma.tableSession.findFirst({
      where: { tableId, isActive: true },
    });
    if (!activeSession) continue;

    const statusMap = await ensureTableStatuses(restaurantId);
    const availableStatusId = statusMap['AVAILABLE'];

    await prisma.$transaction(async (tx) => {
      await tx.tableSession.update({
        where: { id: activeSession.id },
        data: { isActive: false, endedAt: new Date() },
      });
      await tx.table.update({
        where: { id: tableId },
        data: { tableStatusId: availableStatusId },
      });
    });

    broadcastTableUpdate(restaurantId, 'TABLE_SESSION_CLOSED', {
      tableId,
      sessionId: activeSession.id,
      status: 'AVAILABLE',
    });
  }

  return { success: true };
}

export async function getAllTableSessions(restaurantId: string, at?: string) {
  const targetTime = at ? new Date(at) : new Date();

  const sessions = await prisma.tableSession.findMany({
    where: {
      isActive: true,
      startedAt: { lte: targetTime },
      table: { restaurantId, isActive: true },
    },
    include: {
      table: { select: { id: true, code: true, restaurantId: true } },
      order: { select: { id: true, reference: true, totalAmount: true } },
    },
    orderBy: { startedAt: 'asc' },
  });

  return sessions.map((s) => ({
    id: s.id,
    sessionId: s.id,
    tableId: s.tableId,
    tableCode: s.table.code,
    orderId: s.orderId,
    reservationId: null,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    isActive: s.isActive,
    orderReference: s.order?.reference ?? null,
    orderTotalAmount: s.order?.totalAmount ? Number(s.order.totalAmount) : null,
    reservation: null,
  }));
}

export async function mergeTables(
  restaurantId: string,
  tableIds: string[],
  _reservationId?: string | null,
  _customerId?: string | null
) {
  const normalized = [...new Set(tableIds.filter(Boolean))];
  if (normalized.length < 2) {
    throw new TableServiceError(400, 'At least two table IDs are required to merge');
  }

  const tables = await prisma.table.findMany({
    where: { id: { in: normalized }, restaurantId, isActive: true },
  });
  if (tables.length !== normalized.length) {
    throw new TableServiceError(400, 'One or more tables not found or inactive');
  }

  let sessions = await prisma.tableSession.findMany({
    where: { tableId: { in: normalized }, isActive: true },
    include: { table: true, order: true },
  });

  const statusMap = await ensureTableStatuses(restaurantId);
  const occupiedStatusId = statusMap['OCCUPIED'];

  for (const tableId of normalized) {
    if (!sessions.some((s) => s.tableId === tableId)) {
      await createTableSession(restaurantId, tableId);
    }
  }

  sessions = await prisma.tableSession.findMany({
    where: { tableId: { in: normalized }, isActive: true },
    include: { table: true, order: true },
  });

  const orderIds = [...new Set(sessions.filter((s) => s.orderId).map((s) => s.orderId!))];

  const sessionInfos = sessions.map((s) => ({
    id: s.id,
    sessionId: s.id,
    tableId: s.tableId,
    tableCode: s.table?.code,
    orderId: s.orderId,
    reservationId: null,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    isActive: s.isActive,
    orderReference: s.order?.reference ?? null,
    orderTotalAmount: s.order?.totalAmount ? Number(s.order.totalAmount) : null,
    reservation: null,
  }));

  if (orderIds.length === 0) {
    await prisma.table.updateMany({
      where: { id: { in: normalized } },
      data: { tableStatusId: occupiedStatusId },
    });
    broadcastTableUpdate(restaurantId, 'TABLE_SESSIONS_MERGED', { tableIds: normalized });
    return {
      orderId: null,
      requiresManualResolution: false,
      message: 'No existing order. Sessions created/validated.',
      existingOrderIds: [],
      sessions: sessionInfos,
    };
  }

  if (orderIds.length > 1) {
    return {
      orderId: null,
      requiresManualResolution: true,
      message: 'Multiple existing orders found. Manual resolution required.',
      existingOrderIds: orderIds,
      sessions: sessionInfos,
    };
  }

  const targetOrderId = orderIds[0];
  await prisma.$transaction(
    sessions
      .filter((s) => s.orderId !== targetOrderId)
      .map((s) =>
        prisma.tableSession.update({
          where: { id: s.id },
          data: { orderId: targetOrderId },
        })
      )
  );

  await prisma.table.updateMany({
    where: { id: { in: normalized } },
    data: { tableStatusId: occupiedStatusId },
  });

  broadcastTableUpdate(restaurantId, 'TABLE_SESSIONS_MERGED', { tableIds: normalized, orderId: targetOrderId });

  return {
    orderId: targetOrderId,
    requiresManualResolution: false,
    message: 'Merged successfully to existing order.',
    existingOrderIds: orderIds,
    sessions: sessionInfos,
  };
}

export async function moveTable(restaurantId: string, sourceTableId: string, targetTableId: string) {
  if (sourceTableId === targetTableId) {
    throw new TableServiceError(400, 'SourceTableId and TargetTableId must be different');
  }

  await transferTableSession(restaurantId, sourceTableId, targetTableId);

  const session = await prisma.tableSession.findFirst({
    where: { tableId: targetTableId, isActive: true },
    include: {
      table: { select: { code: true } },
      order: { select: { reference: true, totalAmount: true } },
    },
  });

  if (!session) {
    throw new TableServiceError(500, 'Failed to retrieve transferred session');
  }

  return {
    id: session.id,
    sessionId: session.id,
    tableId: session.tableId,
    tableCode: session.table.code,
    orderId: session.orderId,
    reservationId: null,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    isActive: session.isActive,
    orderReference: session.order?.reference ?? null,
    orderTotalAmount: session.order?.totalAmount ? Number(session.order.totalAmount) : null,
    reservation: null,
  };
}

export async function updateTableStatus(restaurantId: string, tableId: string, statusId: number) {
  const code = enumToStatusCode(statusId);
  if (code === 'AVAILABLE') {
    const activeSession = await prisma.tableSession.count({
      where: { tableId, isActive: true },
    });
    if (activeSession > 0) {
      throw new TableServiceError(400, 'Cannot set table to Available while it has an active session');
    }
  }
  return updateTable(restaurantId, tableId, { tableStatusId: statusId });
}

export async function getTableById(restaurantId: string, id: string) {
  const table = await prisma.table.findFirst({
    where: { id, restaurantId, isActive: true },
    include: {
      tableStatus: { select: { code: true, name: true } },
      floor: { select: { name: true } },
    },
  });
  if (!table) {
    throw new TableServiceError(404, 'Table not found');
  }
  return mapTableToItem(table);
}
