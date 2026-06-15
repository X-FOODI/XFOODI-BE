import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { getIO } from '../socket';
import { randomUUID } from 'crypto';

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
  });
  return floors;
}

export async function createFloor(
  restaurantId: string,
  data: { name: string; imageUrl?: string; width?: number; height?: number }
) {
  const newFloor = await prisma.floor.create({
    data: {
      name: data.name.trim(),
      restaurantId,
      imageUrl: data.imageUrl || null,
      width: new Prisma.Decimal(data.width ?? 100),
      height: new Prisma.Decimal(data.height ?? 100),
      isActive: true,
    },
  });
  return newFloor;
}

export async function updateFloor(
  restaurantId: string,
  id: string,
  data: { name?: string; imageUrl?: string; width?: number; height?: number; isActive?: boolean }
) {
  const existing = await prisma.floor.findFirst({
    where: { id, restaurantId },
  });

  if (!existing) {
    throw new TableServiceError(404, 'Floor not found');
  }

  const updated = await prisma.floor.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.width !== undefined && { width: new Prisma.Decimal(data.width) }),
      ...(data.height !== undefined && { height: new Prisma.Decimal(data.height) }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

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

  return tables.map(t => ({
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
    floorId: t.floorId,
    floorName: t.floor.name,
    status: t.tableStatus.code,
    statusName: t.tableStatus.name,
    statusColor: t.tableStatus.colorCode,
    qrCodeUrl: t.qrCodeUrl,
  }));
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

  const statusMap = await ensureTableStatuses(restaurantId);
  const availableStatusId = statusMap['AVAILABLE'];

  const tableId = randomUUID();
  const newTable = await prisma.table.create({
    data: {
      id: tableId,
      code: data.code.trim(),
      restaurantId,
      floorId: data.floorId,
      seatingCapacity: data.seatingCapacity,
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

  return newTable;
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
    status?: string; // 'AVAILABLE' | 'OCCUPIED' | 'RESERVED'
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

  if (data.status !== undefined) {
    const statusMap = await ensureTableStatuses(restaurantId);
    const statusId = statusMap[data.status.toUpperCase()];
    if (!statusId) {
      throw new TableServiceError(400, `Invalid table status "${data.status}"`);
    }
    updateData.tableStatusId = statusId;
  }

  const updated = await prisma.table.update({
    where: { id },
    data: updateData,
    include: {
      tableStatus: {
        select: { code: true, name: true, colorCode: true },
      },
    },
  });

  const payload = {
    tableId: updated.id,
    floorId: updated.floorId,
    code: updated.code,
    status: updated.tableStatus.code,
  };

  broadcastTableUpdate(restaurantId, 'TABLE_UPDATED', payload);

  return updated;
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
