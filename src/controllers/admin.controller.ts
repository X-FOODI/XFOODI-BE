import { Request, Response } from 'express';
import { centralPrisma } from '../lib/prisma';
import { sendAccountDisabledEmail, sendRestaurantDisabledEmail } from '../lib/email';

export const disableRestaurant = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const adminId = (req as any).user?.sub || (req as any).user?.userId || 'unknown-admin';
    const actorEmail = (req as any).user?.email ?? null;
    const actorName = (req as any).user?.fullName || (req as any).user?.name || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;

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
          actorEmail,
          actorName,
          targetType: 'RESTAURANT',
          targetId: id,
          ipAddress,
          reason,
          metadata: { restaurantName: restaurant.name },
        },
      }),
    ]);

    // Send email to owner
    const owner = await centralPrisma.user.findUnique({ where: { id: restaurant.ownerId } });
    let emailSent = false;
    let emailWarning: string | undefined;

    if (owner?.email) {
      try {
        await sendRestaurantDisabledEmail(owner.email, restaurant.name, reason, disabledAt);
        emailSent = true;
        console.log(`[Admin] Restaurant disabled email sent to ${owner.email}`);
      } catch (emailErr: any) {
        const sendGridMsg = emailErr?.response?.body?.errors?.[0]?.message;
        emailWarning = sendGridMsg?.includes('Maximum credits exceeded')
          ? 'Tài khoản SendGrid đã hết credit — email thông báo chưa được gửi. Vui lòng nạp thêm credit SendGrid.'
          : (sendGridMsg || 'Không thể gửi email thông báo cho chủ nhà hàng.');
        console.error('Failed to send restaurant disabled email:', emailErr?.response?.body || emailErr);
      }
    } else {
      emailWarning = 'Chủ nhà hàng không có email — bỏ qua gửi thông báo.';
      console.warn(`[Admin] Restaurant ${id} disabled but owner has no email — notification skipped`);
    }

    res.json({
      success: true,
      message: 'Restaurant disabled successfully',
      data: { emailSent, emailWarning },
    });
  } catch (error) {
    console.error('Error disabling restaurant:', error);
    res.status(500).json({ success: false, message: 'Failed to disable restaurant' });
  }
};

export const enableRestaurant = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const adminId = (req as any).user?.sub || (req as any).user?.userId || 'unknown-admin';
    const actorEmail = (req as any).user?.email ?? null;
    const actorName = (req as any).user?.fullName || (req as any).user?.name || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;

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
          actorEmail,
          actorName,
          targetType: 'RESTAURANT',
          targetId: id,
          ipAddress,
          metadata: { restaurantName: restaurant.name },
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
    const adminId = (req as any).user?.sub || (req as any).user?.userId || 'unknown-admin';
    const actorEmail = (req as any).user?.email ?? null;
    const actorName = (req as any).user?.fullName || (req as any).user?.name || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;

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
          isActive: false,
          disabledReason: reason,
          disabledAt,
          disabledBy: adminId,
        },
      }),
      centralPrisma.auditLog.create({
        data: {
          action: 'USER_DISABLED',
          adminId,
          actorEmail,
          actorName,
          targetType: 'USER',
          targetId: id,
          ipAddress,
          reason,
          metadata: { userEmail: user.email, userName: user.fullName || user.userName },
        },
      }),
    ]);

    let emailSent = false;
    let emailWarning: string | undefined;

    if (user.email) {
      const recipientName = user.fullName || user.userName || 'Quý khách';
      try {
        await sendAccountDisabledEmail(user.email, recipientName, reason, disabledAt);
        emailSent = true;
        console.log(`[Admin] Account disabled email sent to ${user.email}`);
      } catch (emailErr: any) {
        const sendGridMsg = emailErr?.response?.body?.errors?.[0]?.message;
        emailWarning = sendGridMsg?.includes('Maximum credits exceeded')
          ? 'Tài khoản SendGrid đã hết credit — email thông báo chưa được gửi. Vui lòng nạp thêm credit SendGrid.'
          : (sendGridMsg || 'Không thể gửi email thông báo cho người dùng.');
        console.error('Failed to send account disabled email:', emailErr?.response?.body || emailErr);
      }
    } else {
      emailWarning = 'Người dùng không có email — bỏ qua gửi thông báo.';
      console.warn(`[Admin] User ${id} disabled but has no email — notification skipped`);
    }

    res.json({
      success: true,
      message: 'User disabled successfully',
      data: { emailSent, emailWarning },
    });
  } catch (error) {
    console.error('Error disabling user:', error);
    res.status(500).json({ success: false, message: 'Failed to disable user' });
  }
};

export const enableUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const adminId = (req as any).user?.sub || (req as any).user?.userId || 'unknown-admin';
    const actorEmail = (req as any).user?.email ?? null;
    const actorName = (req as any).user?.fullName || (req as any).user?.name || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;

    const user = await centralPrisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await centralPrisma.$transaction([
      centralPrisma.user.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          isActive: true,
          disabledReason: null,
          disabledAt: null,
          disabledBy: null,
        },
      }),
      centralPrisma.auditLog.create({
        data: {
          action: 'USER_ENABLED',
          adminId,
          actorEmail,
          actorName,
          targetType: 'USER',
          targetId: id,
          ipAddress,
          metadata: { userEmail: user.email, userName: user.fullName || user.userName },
        },
      }),
    ]);

    res.json({ success: true, message: 'User enabled successfully' });
  } catch (error) {
    console.error('Error enabling user:', error);
    res.status(500).json({ success: false, message: 'Failed to enable user' });
  }
};
