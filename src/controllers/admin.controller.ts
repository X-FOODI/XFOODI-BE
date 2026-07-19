import { Request, Response } from 'express';
import { centralPrisma } from '../lib/prisma';
import { sendAccountDisabledEmail, sendRestaurantDisabledEmail } from '../lib/email';

export const disableRestaurant = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const adminId = (req as any).user?.userId || 'unknown-admin';

    if (!reason || reason.length < 10 || reason.length > 500) {
      return res.status(400).json({ success: false, message: 'Reason must be between 10 and 500 characters' });
    }

    const restaurant = await centralPrisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found' });
    }

    const disabledAt = new Date();

    await centralPrisma.$transaction([
      centralPrisma.restaurant.update({
        where: { id },
        data: {
          status: 'DISABLED',
          disabledReason: reason,
          disabledAt,
          disabledBy: adminId,
        },
      }),
      centralPrisma.auditLog.create({
        data: {
          action: 'RESTAURANT_DISABLED',
          adminId,
          targetId: id,
          reason,
        },
      }),
    ]);

    // Send email to owner
    const owner = await centralPrisma.user.findUnique({ where: { id: restaurant.ownerId } });
    if (owner && owner.email) {
      await sendRestaurantDisabledEmail(owner.email, restaurant.name, reason, disabledAt);
    }

    res.json({ success: true, message: 'Restaurant disabled successfully' });
  } catch (error) {
    console.error('Error disabling restaurant:', error);
    res.status(500).json({ success: false, message: 'Failed to disable restaurant' });
  }
};

export const enableRestaurant = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const adminId = (req as any).user?.userId || 'unknown-admin';

    const restaurant = await centralPrisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found' });
    }

    await centralPrisma.$transaction([
      centralPrisma.restaurant.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          disabledReason: null,
          disabledAt: null,
          disabledBy: null,
        },
      }),
      centralPrisma.auditLog.create({
        data: {
          action: 'RESTAURANT_ENABLED',
          adminId,
          targetId: id,
        },
      }),
    ]);

    res.json({ success: true, message: 'Restaurant enabled successfully' });
  } catch (error) {
    console.error('Error enabling restaurant:', error);
    res.status(500).json({ success: false, message: 'Failed to enable restaurant' });
  }
};

export const disableUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const adminId = (req as any).user?.userId || 'unknown-admin';

    if (!reason || reason.length < 10 || reason.length > 500) {
      return res.status(400).json({ success: false, message: 'Reason must be between 10 and 500 characters' });
    }

    const user = await centralPrisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const disabledAt = new Date();

    await centralPrisma.$transaction([
      centralPrisma.user.update({
        where: { id },
        data: {
          status: 'DISABLED',
          disabledReason: reason,
          disabledAt,
          disabledBy: adminId,
        },
      }),
      centralPrisma.auditLog.create({
        data: {
          action: 'USER_DISABLED',
          adminId,
          targetId: id,
          reason,
        },
      }),
    ]);

    if (user.email) {
      await sendAccountDisabledEmail(user.email, user.fullName || user.userName || 'User', reason, disabledAt);
    }

    res.json({ success: true, message: 'User disabled successfully' });
  } catch (error) {
    console.error('Error disabling user:', error);
    res.status(500).json({ success: false, message: 'Failed to disable user' });
  }
};

export const enableUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const adminId = (req as any).user?.userId || 'unknown-admin';

    const user = await centralPrisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await centralPrisma.$transaction([
      centralPrisma.user.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          disabledReason: null,
          disabledAt: null,
          disabledBy: null,
        },
      }),
      centralPrisma.auditLog.create({
        data: {
          action: 'USER_ENABLED',
          adminId,
          targetId: id,
        },
      }),
    ]);

    res.json({ success: true, message: 'User enabled successfully' });
  } catch (error) {
    console.error('Error enabling user:', error);
    res.status(500).json({ success: false, message: 'Failed to enable user' });
  }
};
