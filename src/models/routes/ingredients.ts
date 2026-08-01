import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import { prismaStorage } from '../../lib/prisma';
import type { PrismaClient } from '@prisma/client';
import { getLowStockIngredients } from '../../services/inventory.service';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(tenantGuard);

function getDb() {
  return prismaStorage.getStore() as PrismaClient;
}

// ─── Cảnh báo tồn kho thấp ───────────────────────────────────────────────────
router.get('/low-stock', async (req: any, res: any) => {
  try {
    const restaurantId = req.user.restaurantId;
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Thiếu restaurantId' });
    const data = await getLowStockIngredients(restaurantId);
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[Ingredients] low-stock error:', err?.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy cảnh báo tồn kho' });
  }
});

// ─── Ingredients CRUD ────────────────────────────────────────────────────────
router.get('/', async (req: any, res: any) => {
  try {
    const db = getDb();
    const restaurantId = req.user.restaurantId;
    if (!restaurantId) return res.status(400).json({ success: false, message: 'Restaurant ID is required' });

    const { search, categoryId, supplierId, status } = req.query;

    const where: any = { restaurantId };
    if (categoryId) where.ingredientCategoryId = categoryId;
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = Number(status);
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const items = await db.ingredient.findMany({
      where,
      include: {
        category: true,
        supplier: true,
        inventoryStock: true,
      },
      orderBy: { name: 'asc' },
    });

    return res.json({ success: true, data: items });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req: any, res: any) => {
  try {
    const db = getDb();
    const restaurantId = req.user.restaurantId;
    const { name, code, unit, minStockLevel, maxStockLevel, supplierId, type, ingredientCategoryId, currentQuantity } = req.body;

    const existing = await db.ingredient.findFirst({
      where: { code, restaurantId }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Mã nguyên liệu đã tồn tại trong nhà hàng' });
    }

    const ingredient = await db.ingredient.create({
      data: {
        name,
        code,
        unit,
        minStockLevel: Number(minStockLevel) || 0,
        maxStockLevel: Number(maxStockLevel) || 9999,
        supplierId: supplierId || null,
        type: type || null,
        isActive: true,
        ingredientCategoryId: ingredientCategoryId || null,
        restaurantId,
        inventoryStock: {
          create: {
            currentQuantity: Number(currentQuantity) || 0,
            lastUpdated: new Date()
          }
        }
      },
      include: {
        category: true,
        supplier: true,
        inventoryStock: true
      }
    });

    return res.status(201).json({ success: true, data: ingredient });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/:id', async (req: any, res: any) => {
  try {
    const db = getDb();
    const { name, code, unit, minStockLevel, maxStockLevel, supplierId, type, ingredientCategoryId, currentQuantity } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined) data.code = code;
    if (unit !== undefined) data.unit = unit;
    if (minStockLevel !== undefined) data.minStockLevel = Number(minStockLevel);
    if (maxStockLevel !== undefined) data.maxStockLevel = Number(maxStockLevel);
    if (supplierId !== undefined) data.supplierId = supplierId || null;
    if (type !== undefined) data.type = type || null;
    if (ingredientCategoryId !== undefined) data.ingredientCategoryId = ingredientCategoryId || null;

    const updated = await db.ingredient.update({
      where: { id: req.params.id },
      data,
      include: {
        category: true,
        supplier: true,
        inventoryStock: true
      }
    });

    if (currentQuantity !== undefined && updated.inventoryStock) {
      await db.inventoryStock.update({
        where: { id: updated.inventoryStock.id },
        data: {
          currentQuantity: Number(currentQuantity),
          lastUpdated: new Date()
        }
      });
    }

    const final = await db.ingredient.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        supplier: true,
        inventoryStock: true
      }
    });

    return res.json({ success: true, data: final });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', async (req: any, res: any) => {
  try {
    const db = getDb();
    
    // Delete stock transactions, inventory stocks, recipe links first to avoid foreign key errors
    await db.stockTransaction.deleteMany({ where: { ingredientId: req.params.id } });
    await db.inventoryStock.deleteMany({ where: { ingredientId: req.params.id } });
    await db.dishRecipe.deleteMany({ where: { ingredientId: req.params.id } });
    
    await db.ingredient.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Categories ──────────────────────────────────────────────────────────────
router.get('/categories', async (req: any, res: any) => {
  try {
    const db = getDb();
    const restaurantId = req.user.restaurantId;
    const cats = await db.ingredientCategory.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, data: cats });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/categories', async (req: any, res: any) => {
  try {
    const db = getDb();
    const restaurantId = req.user.restaurantId;
    const { name, code, description } = req.body;
    
    const cat = await db.ingredientCategory.create({
      data: {
        name,
        code,
        description: description || null,
        isActive: true,
        restaurantId
      }
    });
    return res.status(201).json({ success: true, data: cat });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Suppliers ───────────────────────────────────────────────────────────────
router.get('/suppliers', async (req: any, res: any) => {
  try {
    const db = getDb();
    const restaurantId = req.user.restaurantId;
    const suppliers = await db.supplier.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, data: suppliers });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/suppliers', async (req: any, res: any) => {
  try {
    const db = getDb();
    const restaurantId = req.user.restaurantId;
    const { name, phone, email, address } = req.body;
    
    const supplier = await db.supplier.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        isActive: true,
        restaurantId
      }
    });
    return res.status(201).json({ success: true, data: supplier });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Stock Transactions ───────────────────────────────────────────────────────
router.post('/transactions', async (req: any, res: any) => {
  try {
    const db = getDb();
    const { ingredientId, transactionType, quantity, unitPrice, reference } = req.body;

    const qty = Number(quantity);
    const price = Number(unitPrice);
    
    const ingredient = await db.ingredient.findUnique({
      where: { id: ingredientId },
      include: { inventoryStock: true }
    });
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });

    const totalAmount = qty * price;
    
    const transaction = await db.stockTransaction.create({
      data: {
        ingredientId,
        transactionType,
        quantity: qty,
        unitPrice: price,
        totalAmount,
        reference: reference || null
      }
    });

    if (ingredient.inventoryStock) {
      let nextQty = Number(ingredient.inventoryStock.currentQuantity);
      if (transactionType === 'IMPORT') {
        nextQty += qty;
      } else if (transactionType === 'EXPORT') {
        nextQty = Math.max(0, nextQty - qty);
      }
      
      await db.inventoryStock.update({
        where: { id: ingredient.inventoryStock.id },
        data: {
          currentQuantity: nextQty,
          lastUpdated: new Date()
        }
      });
    }

    return res.status(201).json({ success: true, data: transaction });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
