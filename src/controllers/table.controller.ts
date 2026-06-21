import type { RequestHandler } from 'express';
import * as tableService from '../services/table.service';
import { prisma } from '../lib/prisma';

function getRestaurantId(req: any): string | null {
  // JWT (Owner / Staff) — primary source
  if (req.user?.restaurantId) {
    return req.user.restaurantId as string;
  }
  // Set by tenantGuard or tenant DB middleware
  if (req.tenantId) {
    return req.tenantId as string;
  }
  if (req.tenant?.id) {
    return req.tenant.id as string;
  }
  if (req.restaurant?.id) {
    return req.restaurant.id as string;
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
  console.error("CHI TIẾT LỖI DATABASE:", error);
  console.error('[TableController] Error:', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

/** Read field from JSON body or multipart FormData (PascalCase from RestX FE). */
function field(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = body[key];
    if (val !== undefined && val !== null && val !== '') {
      return String(val);
    }
  }
  return undefined;
}

function numField(body: Record<string, unknown>, ...keys: string[]): number | undefined {
  const raw = field(body, ...keys);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function boolField(body: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  const raw = field(body, ...keys);
  if (raw === undefined) return undefined;
  return raw === 'true' || raw === '1';
}

function parseTableUpdateBody(req: any) {
  const body = req.body as Record<string, unknown>;

  const getFileBuffer = (fieldName: string): Buffer | undefined => {
    if (!req.files) return undefined;
    if (Array.isArray(req.files)) {
      const f = req.files.find((f: any) => f.fieldname === fieldName);
      return f?.buffer;
    } else {
      const filesObj = req.files as Record<string, Express.Multer.File[]>;
      return filesObj[fieldName]?.[0]?.buffer;
    }
  };

  const cubeFrontImageBuffer = getFileBuffer('CubeFrontImage');
  const cubeBackImageBuffer = getFileBuffer('CubeBackImage');
  const cubeLeftImageBuffer = getFileBuffer('CubeLeftImage');
  const cubeRightImageBuffer = getFileBuffer('CubeRightImage');
  const cubeTopImageBuffer = getFileBuffer('CubeTopImage');
  const cubeBottomImageBuffer = getFileBuffer('CubeBottomImage');

  return {
    code: field(body, 'code', 'Code'),
    seatingCapacity: numField(body, 'seatingCapacity', 'SeatingCapacity'),
    type: field(body, 'type', 'Type'),
    shape: field(body, 'shape', 'Shape'),
    positionX: numField(body, 'positionX', 'PositionX'),
    positionY: numField(body, 'positionY', 'PositionY'),
    width: numField(body, 'width', 'Width'),
    height: numField(body, 'height', 'Height'),
    rotation: numField(body, 'rotation', 'Rotation'),
    floorId: field(body, 'floorId', 'FloorId'),
    tableStatusId: numField(body, 'tableStatusId', 'TableStatusId'),
    isActive: boolField(body, 'isActive', 'IsActive'),
    has3DView: boolField(body, 'has3DView', 'Has3DView'),
    viewDescription: field(body, 'viewDescription', 'ViewDescription'),
    defaultViewUrl: field(body, 'defaultViewUrl', 'DefaultViewUrl'),
    qrCodeUrl: field(body, 'qrCodeUrl', 'QRCodeUrl'),
    cubeFrontImageUrl: field(body, 'cubeFrontImageUrl', 'CubeFrontImageUrl'),
    cubeBackImageUrl: field(body, 'cubeBackImageUrl', 'CubeBackImageUrl'),
    cubeLeftImageUrl: field(body, 'cubeLeftImageUrl', 'CubeLeftImageUrl'),
    cubeRightImageUrl: field(body, 'cubeRightImageUrl', 'CubeRightImageUrl'),
    cubeTopImageUrl: field(body, 'cubeTopImageUrl', 'CubeTopImageUrl'),
    cubeBottomImageUrl: field(body, 'cubeBottomImageUrl', 'CubeBottomImageUrl'),
    clearCubemap: boolField(body, 'clearCubemap', 'ClearCubemap') ?? false,
    panoramaBuffer: cubeFrontImageBuffer, // legacy fallback support
    cubeFrontImageBuffer,
    cubeBackImageBuffer,
    cubeLeftImageBuffer,
    cubeRightImageBuffer,
    cubeTopImageBuffer,
    cubeBottomImageBuffer,
  };
}

function parseFloorBody(req: any) {
  const body = req.body as Record<string, unknown>;
  const imageFile = req.file as Express.Multer.File | undefined;
  return {
    name: field(body, 'name', 'Name'),
    width: numField(body, 'width', 'Width'),
    height: numField(body, 'height', 'Height'),
    isActive: boolField(body, 'isActive', 'IsActive'),
    imageBuffer: imageFile?.buffer,
    imageName: imageFile?.originalname,
  };
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
    const parsed = parseFloorBody(req);
    if (!parsed.name?.trim()) {
      return res.status(400).json({ success: false, message: 'Floor name is required.' });
    }
    const floor = await tableService.createFloor(restaurantId, {
      name: parsed.name,
      width: parsed.width,
      height: parsed.height,
      imageBuffer: parsed.imageBuffer,
      imageName: parsed.imageName,
    });
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
    const parsed = parseFloorBody(req);
    const updated = await tableService.updateFloor(restaurantId, id, {
      name: parsed.name,
      width: parsed.width,
      height: parsed.height,
      isActive: parsed.isActive,
      imageBuffer: parsed.imageBuffer,
      imageName: parsed.imageName,
    });
    res.json({ success: true, message: 'Floor updated successfully', data: { id: updated.id } });
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
    const id = req.params.id as string;
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
    const id = req.params.id as string;
    const { tables } = req.body;
    const layoutData = Array.isArray(tables)
      ? tables.map((t: any) => ({
          id: t.id,
          positionX: t.x ?? t.positionX,
          positionY: t.y ?? t.positionY,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
        }))
      : req.body.layout;
    if (!Array.isArray(layoutData)) {
      return res.status(400).json({ success: false, message: 'Layout data must be an array.' });
    }
    const result = await tableService.updateFloorLayout(restaurantId, id, layoutData);
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

export const handleGetTableById: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const table = await tableService.getTableById(restaurantId, req.params.id as string);
    res.json(table);
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
    const body = req.body ?? {};
    const code = body.code ?? body.Code;
    const seatingCapacity = body.seatingCapacity ?? body.SeatingCapacity;
    const type = body.type ?? body.Type;
    const shape = body.shape ?? body.Shape;
    const positionX = body.positionX ?? body.PositionX;
    const positionY = body.positionY ?? body.PositionY;
    const width = body.width ?? body.Width;
    const height = body.height ?? body.Height;
    const rotation = body.rotation ?? body.Rotation;
    const floorId = body.floorId ?? body.FloorId;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Table code is required.' });
    }

    const isDeco = String(code).startsWith('DECO_');
    const capacityNum = Number(seatingCapacity);
    if (!Number.isFinite(capacityNum) || capacityNum < 0) {
      return res.status(400).json({ success: false, message: 'Seating capacity must be a valid number.' });
    }
    if (!isDeco && capacityNum <= 0) {
      return res.status(400).json({ success: false, message: 'Seating capacity must be a positive number.' });
    }
    if (!floorId || typeof floorId !== 'string' || !floorId.trim()) {
      return res.status(400).json({ success: false, message: 'Floor ID is required.' });
    }

    const table = await tableService.createTable(restaurantId, {
      code: String(code).trim(),
      seatingCapacity: isDeco ? 0 : capacityNum,
      type: type || 'Normal',
      shape: shape || (isDeco ? 'Rectangle' : 'Square'),
      positionX,
      positionY,
      width,
      height,
      rotation,
      floorId: String(floorId).trim(),
    });

    res.status(201).json(table);
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
    const parsed = parseTableUpdateBody(req);
    const updated = await tableService.updateTable(restaurantId, id, parsed);
    res.json(updated);
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleUpdateTableStatus: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const id = req.params.id as string;
    const statusId = typeof req.body === 'number' ? req.body : Number(req.body);
    if (!Number.isFinite(statusId)) {
      return res.status(400).json({ success: false, message: 'Invalid table status.' });
    }
    const updated = await tableService.updateTableStatus(restaurantId, id, statusId);
    res.json(updated);
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

export const handleBulkDeleteTables: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }

    const { ids } = req.body as { ids?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids must be a non-empty array of table IDs.' });
    }

    const validIds = ids.filter((id) => typeof id === 'string' && id.trim().length > 0) as string[];
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid table IDs provided.' });
    }

    const result = await tableService.bulkDeleteTables(restaurantId, validIds);

    res.json({
      success: true,
      message: `Đã xóa ${result.deleted.length} bàn thành công.${result.skipped.length > 0 ? ` Bỏ qua ${result.skipped.length} bàn đang phục vụ: ${result.skipped.join(', ')}.` : ''}`,
      data: result,
    });
  } catch (err) {
    handleTableError(res, err);
  }
};


// ─── Session Controllers (RestX-compatible routes) ─────────────────────────────

export const handleGetSessions: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const at = req.query.at as string | undefined;
    const sessions = await tableService.getAllTableSessions(restaurantId, at);
    res.json(sessions);
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleCreateSessionByTableId: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const tableId = req.params.tableId as string;
    const session = await tableService.createTableSession(restaurantId, tableId);
    res.json({
      id: session.id,
      sessionId: session.id,
      tableId: session.tableId,
      orderId: session.orderId,
      reservationId: null,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      isActive: session.isActive,
    });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleCloseSessions: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const tableIds = Array.isArray(req.body) ? req.body : req.body?.tableIds;
    if (!Array.isArray(tableIds) || tableIds.length === 0) {
      return res.status(400).json({ success: false, message: 'TableIds is required.' });
    }
    await tableService.closeTableSessions(restaurantId, tableIds.map(String));
    res.json({ success: true });
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleMergeTables: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { tableIds, reservationId, customerId } = req.body;
    if (!Array.isArray(tableIds) || tableIds.length < 2) {
      return res.status(400).json({ success: false, message: 'At least two tableIds are required.' });
    }
    const result = await tableService.mergeTables(
      restaurantId,
      tableIds.map(String),
      reservationId,
      customerId
    );
    if (result.requiresManualResolution) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (err) {
    handleTableError(res, err);
  }
};

export const handleMoveTable: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant ID is required.' });
    }
    const { sourceTableId, targetTableId } = req.body;
    if (!sourceTableId || !targetTableId) {
      return res.status(400).json({ success: false, message: 'Both sourceTableId and targetTableId are required.' });
    }
    const result = await tableService.moveTable(restaurantId, sourceTableId, targetTableId);
    res.json(result);
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
          select: { id: true, name: true, slug: true, logoUrl: true, address: true, phone: true },
        },
        floor: {
          select: { name: true },
        },
        tableStatus: { select: { code: true, name: true } },
      },
    });

    if (!table) {
      res.status(404).json({ success: false, message: 'Bàn ăn không tồn tại hoặc đã bị xóa.' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...tableService.mapTableToItem(table),
        restaurant: table.restaurant,
        floor: table.floor,
      },
    });
  } catch (err) {
    handleTableError(res, err);
  }
};
