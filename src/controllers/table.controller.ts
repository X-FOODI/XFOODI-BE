import type { RequestHandler } from 'express';
import * as tableService from '../services/table.service';
import { prisma } from '../lib/prisma';

function getRestaurantId(req: any): string | null {
  if (req.user?.restaurantId) {
    return req.user.restaurantId as string;
  }
  if (req.body?.restaurantId) {
    return req.body.restaurantId as string;
  }
  if (req.query?.restaurantId) {
    return req.query.restaurantId as string;
  }
  return null;
}

function handleTableError(res: any, err: unknown): void {
  if (err instanceof tableService.TableServiceError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  const error = err as Error;
  console.error('[TableController] Error:', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

// ─── Floor Controllers ────────────────────────────────────────────────────────

export const handleListFloors: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const floors = await tableService.listFloors(restaurantId);
    res.json({ success: true, data: floors });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleCreateFloor: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { name, imageUrl, width, height } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Floor name is required.' });
    }
    const floor = await tableService.createFloor(restaurantId, { name, imageUrl, width, height });
    res.status(201).json({ success: true, message: 'Floor created successfully', data: floor });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleUpdateFloor: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const id = req.params.id as string;
    const { name, imageUrl, width, height, isActive } = req.body;
    const updated = await tableService.updateFloor(restaurantId, id, { name, imageUrl, width, height, isActive });
    res.json({ success: true, message: 'Floor updated successfully', data: updated });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleDeleteFloor: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const id = req.params.id as string;
    await tableService.deleteFloor(restaurantId, id);
    res.json({ success: true, message: 'Floor deleted successfully' });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleGetFloorLayout: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const id = req.params.id as string; // floorId
    const layout = await tableService.getFloorLayout(restaurantId, id);
    res.json({ success: true, data: layout });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleUpdateFloorLayout: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const id = req.params.id as string; // floorId
    const { layout } = req.body; // Array of table layouts
    if (!Array.isArray(layout)) {
      return res.status(400).json({ success: false, message: 'Layout data must be an array.' });
    }
    const result = await tableService.updateFloorLayout(restaurantId, id, layout);
    res.json({ success: true, message: 'Floor layout updated successfully', data: result });
  } catch (err) {
    handleTableError(res, err);
  }
};

// ─── Table Controllers ────────────────────────────────────────────────────────

export const handleListTables: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { floorId } = req.query as { floorId?: string };
    const tables = await tableService.listTables(restaurantId, floorId);
    res.json({ success: true, data: tables });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleCreateTable: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { code, seatingCapacity, type, shape, positionX, positionY, width, height, rotation, floorId } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Table code is required.' });
    }
    if (!seatingCapacity || typeof seatingCapacity !== 'number' || seatingCapacity <= 0) {
      return res.status(400).json({ success: false, message: 'Seating capacity must be a positive number.' });
    }
    if (!floorId || typeof floorId !== 'string') {
      return res.status(400).json({ success: false, message: 'Floor ID is required.' });
    }

    const table = await tableService.createTable(restaurantId, {
      code,
      seatingCapacity,
      type: type || 'Normal',
      shape: shape || 'Square',
      positionX,
      positionY,
      width,
      height,
      rotation,
      floorId,
    });

    res.status(201).json({ success: true, message: 'Table created successfully', data: table });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleUpdateTable: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const id = req.params.id as string;
    const body = req.body;
    const updated = await tableService.updateTable(restaurantId, id, body);
    res.json({ success: true, message: 'Table updated successfully', data: updated });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleDeleteTable: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const id = req.params.id as string;
    await tableService.deleteTable(restaurantId, id);
    res.json({ success: true, message: 'Table deleted successfully' });
  } catch (err) {
    handleTableError(res, err);
  }
};

// ─── Session Controllers ───────────────────────────────────────────────────────

export const handleCreateSession: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { tableId, orderId } = req.body;
    if (!tableId || typeof tableId !== 'string') {
      return res.status(400).json({ success: false, message: 'Table ID is required.' });
    }
    const session = await tableService.createTableSession(restaurantId, tableId, orderId);
    res.status(201).json({ success: true, message: 'Session started successfully', data: session });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleMergeSessions: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { sourceTableId, targetTableId } = req.body;
    if (!sourceTableId || !targetTableId) {
      return res.status(400).json({ success: false, message: 'Both sourceTableId and targetTableId are required.' });
    }
    const result = await tableService.mergeTableSessions(restaurantId, sourceTableId, targetTableId);
    res.json({ success: true, message: 'Table sessions merged successfully', data: result });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleTransferSession: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { fromTableId, toTableId } = req.body;
    if (!fromTableId || !toTableId) {
      return res.status(400).json({ success: false, message: 'Both fromTableId and toTableId are required.' });
    }
    const result = await tableService.transferTableSession(restaurantId, fromTableId, toTableId);
    res.json({ success: true, message: 'Table session transferred successfully', data: result });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleCloseSession: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { tableId } = req.body;
    if (!tableId || typeof tableId !== 'string') {
      return res.status(400).json({ success: false, message: 'Table ID is required.' });
    }
    const result = await tableService.closeTableSession(restaurantId, tableId);
    res.json({ success: true, message: 'Table session closed successfully', data: result });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleGetPublicTableDetail: RequestHandler = async (req, res) => {
  try {
    const id = req.params.id as string;
    const table = await prisma.table.findUnique({
      where: { id, isActive: true },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true, logoUrl: true, address: true, phone: true }
        },
        floor: {
          select: { name: true }
        }
      }
    });

    if (!table) {
      res.status(404).json({ success: false, message: 'Bàn ăn không tồn tại hoặc đã bị xóa.' });
      return;
    }

    res.json({ success: true, data: table });
  } catch (err) {
    handleTableError(res, err);
  }
};
