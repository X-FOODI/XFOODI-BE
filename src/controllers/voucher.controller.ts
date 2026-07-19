import { Request, Response } from 'express';
import { voucherService } from '../services/voucher.service';

/**
 * 1. POST /api/vouchers (Dành cho Chủ nhà hàng / Admin)
 */
export async function createVoucher(req: any, res: Response) {
  try {
    const userRoles = Array.isArray(req.user?.roles)
      ? req.user.roles
      : req.user?.role
      ? [req.user.role]
      : [];

    const isOwner = userRoles.includes('Owner');
    const {
      code,
      title,
      description,
      discountValue,
      discountType,
      pointsRequired,
      expiryDate,
      quantity,
      restaurantId,
      applicableService,
      distributionMode,
      status,
    } = req.body;

    // Validate restaurantId if Owner role
    if (isOwner) {
      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          message: 'restaurantId là bắt buộc đối với Chủ nhà hàng.',
        });
      }
      // Security check: Owner can only create vouchers for their own restaurant
      if (req.user?.restaurantId && restaurantId !== req.user.restaurantId) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền tạo voucher cho nhà hàng này.',
        });
      }
    }

    // Common validations
    if (!code || !title || discountValue === undefined || !discountType || pointsRequired === undefined || !expiryDate || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc để tạo voucher (code, title, discountValue, discountType, pointsRequired, expiryDate, quantity).',
      });
    }

    if (discountType !== 'percentage' && discountType !== 'fixed') {
      return res.status(400).json({
        success: false,
        message: "discountType phải là 'percentage' hoặc 'fixed'.",
      });
    }

    const voucher = await voucherService.createVoucher(restaurantId || null, {
      code,
      title,
      description,
      discountValue,
      discountType,
      pointsRequired,
      expiryDate,
      quantity,
      applicableService,
      distributionMode,
      status,
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo voucher thành công.',
      data: voucher,
    });
  } catch (error: any) {
    console.error('[VoucherController] createVoucher error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi tạo voucher.',
    });
  }
}

/**
 * 2. GET /api/vouchers/eligible (Dành cho Khách hàng)
 */
export async function getEligibleVouchers(req: any, res: Response) {
  try {
    const { restaurantId } = req.query;
    const vouchers = await voucherService.getEligibleVouchers(restaurantId as string);

    return res.json({
      success: true,
      data: vouchers,
    });
  } catch (error: any) {
    console.error('[VoucherController] getEligibleVouchers error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi hệ thống khi lấy danh sách voucher.',
    });
  }
}

/**
 * 3. GET /api/vouchers/restaurant/:restaurantId (Dành cho Admin/Owner)
 */
export async function getVouchersByRestaurant(req: any, res: Response) {
  try {
    const { restaurantId } = req.params;
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'restaurantId là bắt buộc trong URL.',
      });
    }

    const userRoles = Array.isArray(req.user?.roles)
      ? req.user.roles
      : req.user?.role
      ? [req.user.role]
      : [];

    const isOwner = userRoles.includes('Owner');
    const isAdmin = userRoles.some((r: string) => ['Admin', 'SuperAdmin', 'System Admin'].includes(r));

    // Security check: Owner can only view their own restaurant's vouchers
    if (isOwner && !isAdmin) {
      if (req.user?.restaurantId && restaurantId !== req.user.restaurantId) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền truy cập danh sách voucher của nhà hàng này.',
        });
      }
    }

    const vouchers = await voucherService.getVouchersByRestaurant(restaurantId);

    return res.json({
      success: true,
      data: vouchers,
    });
  } catch (error: any) {
    console.error('[VoucherController] getVouchersByRestaurant error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi hệ thống khi lấy danh sách voucher.',
    });
  }
}

/**
 * Legacy methods kept for backwards compatibility (e.g. updating, deleting, redeeming)
 */
export async function updateVoucher(req: any, res: Response) {
  try {
    const { id } = req.params;
    const { restaurantId } = req.body;
    const voucher = await voucherService.updateVoucher(restaurantId || null, id, req.body);

    return res.json({
      success: true,
      message: 'Cập nhật voucher thành công.',
      data: voucher,
    });
  } catch (error: any) {
    console.error('[VoucherController] updateVoucher error:', error);
    return res.status(400).json({ success: false, message: error.message || 'Lỗi khi cập nhật voucher.' });
  }
}

export async function deleteVoucher(req: any, res: Response) {
  try {
    const { id } = req.params;
    const { restaurantId } = req.body;
    await voucherService.deleteVoucher(restaurantId || null, id);

    return res.json({
      success: true,
      message: 'Xóa voucher thành công.',
    });
  } catch (error: any) {
    console.error('[VoucherController] deleteVoucher error:', error);
    return res.status(400).json({ success: false, message: error.message || 'Lỗi khi xóa voucher.' });
  }
}

export async function redeemVoucher(req: any, res: Response) {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { voucherId } = req.body;
    if (!voucherId) {
      return res.status(400).json({ success: false, message: 'voucherId là bắt buộc.' });
    }

    const userVoucher = await voucherService.redeemVoucher(userId, voucherId);

    return res.json({
      success: true,
      message: 'Đổi voucher thành công.',
      data: userVoucher,
    });
  } catch (error: any) {
    console.error('[VoucherController] redeemVoucher error:', error);
    return res.status(400).json({ success: false, message: error.message || 'Lỗi khi đổi voucher.' });
  }
}

export async function getMyVouchers(req: any, res: Response) {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { restaurantId } = req.query;
    const userVouchers = await voucherService.getUserVouchers(userId, restaurantId as string);

    return res.json({
      success: true,
      data: userVouchers,
    });
  } catch (error: any) {
    console.error('[VoucherController] getMyVouchers error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy danh sách voucher đã đổi.' });
  }
}
