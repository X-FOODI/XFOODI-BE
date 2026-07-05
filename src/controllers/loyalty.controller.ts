import { Request, Response } from 'express';
import { loyaltyService } from '../services/loyalty.service';
import { centralPrisma } from '../lib/prisma';

export async function updateLoyaltyConfig(req: any, res: Response) {
  try {
    const { id } = req.params;
    const { loyaltyPointRate } = req.body;

    if (loyaltyPointRate === undefined || typeof loyaltyPointRate !== 'number' || loyaltyPointRate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'loyaltyPointRate hợp lệ (số lớn hơn 0) là bắt buộc.',
      });
    }

    // 1. Update centrally
    const restaurant = await centralPrisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhà hàng.',
      });
    }

    const updated = await centralPrisma.restaurant.update({
      where: { id },
      data: { loyaltyPointRate },
    });

    return res.json({
      success: true,
      message: 'Cấu hình tỷ lệ tích điểm thành công.',
      data: {
        id: updated.id,
        name: updated.name,
        loyaltyPointRate: updated.loyaltyPointRate,
      },
    });
  } catch (error: any) {
    console.error('[LoyaltyController] updateLoyaltyConfig error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi cập nhật cấu hình tích điểm.' });
  }
}

export async function calculatePoints(req: any, res: Response) {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId là bắt buộc.',
      });
    }

    await loyaltyService.calculateAndRewardPoints(orderId);

    return res.json({
      success: true,
      message: 'Tính toán và cộng điểm thành công.',
    });
  } catch (error: any) {
    console.error('[LoyaltyController] calculatePoints error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi hệ thống khi cộng điểm.' });
  }
}

export async function getMyLoyaltyPoints(req: any, res: Response) {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const points = await loyaltyService.getUserLoyaltyPoints(userId);

    return res.json({
      success: true,
      data: points,
    });
  } catch (error: any) {
    console.error('[LoyaltyController] getMyLoyaltyPoints error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy điểm tích lũy.' });
  }
}
