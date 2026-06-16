import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { authMiddleware } from './auth';
import { requireRole } from '../../middlewares/requireRole';
import { encryptValue, decryptValue } from '../../utils/encryption';
import {
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
} from '../../lib/email';
import { assignDefaultRole } from '../../services/role.service';
import { ENV } from '../../config/env';
import { runMigrationsForTenant, seedTenantDatabase } from '../../services/tenantDb.service';
import { auditLogMiddleware } from '../../middlewares/auditLog';

const router: ExpressRouter = Router();

// Track write operations performed by admins
router.use(auditLogMiddleware);

// ── Cloudinary config ──
cloudinary.config({
  cloud_name: ENV.CLOUDINARY.CLOUD_NAME,
  api_key: ENV.CLOUDINARY.API_KEY,
  api_secret: ENV.CLOUDINARY.API_SECRET,
});

// ── Multer: store files in memory, then stream to Cloudinary ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP, and PDF files are allowed'));
    }
  },
});

/** Upload a buffer to Cloudinary and return the secure URL */
async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  filename: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: filename,
        resource_type: 'auto',
        access_mode: 'authenticated', // private — requires signed URL to access
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/** Upload restaurant logo as PUBLIC image (for homepage display) */
async function uploadPublicImage(
  buffer: Buffer,
  folder: string,
  filename: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: filename,
        resource_type: 'image',
        access_mode: 'public',
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/restaurant-applications
// Customer tạo đơn đăng ký mở nhà hàng
// Body: multipart/form-data
// Fields: restaurantName, slug, description, address, phone, email
// Files:  businessLicense, ownershipProof, nationalId
// ──────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  authMiddleware,
  upload.fields([
    { name: 'restaurantImage', maxCount: 1 },
    { name: 'businessLicense', maxCount: 1 },
    { name: 'ownershipProof', maxCount: 1 },
    { name: 'nationalId', maxCount: 1 },
    { name: 'nationalIdBack', maxCount: 1 },
  ]),
  async (req: any, res: any) => {
    try {
      const userId: string = req.user.sub;

      // Kiểm tra xem user đã có đơn PENDING hoặc APPROVED chưa
      const existingApplication = await prisma.restaurantApplication.findFirst({
        where: {
          userId,
          status: { in: ['PENDING', 'APPROVED'] },
        },
      });

      if (existingApplication) {
        const msg =
          existingApplication.status === 'APPROVED'
            ? 'Bạn đã sở hữu nhà hàng. Không thể nộp thêm đơn.'
            : 'Bạn đã có đơn đang chờ duyệt. Vui lòng chờ kết quả.';
        return res.status(409).json({ success: false, message: msg });
      }

      const { restaurantName, slug, description, address, phone, email, cuisineType } = req.body;
      const latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
      const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;

      // Validate required fields
      if (!restaurantName || !slug || !address || !phone || !email) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin bắt buộc: restaurantName, slug, address, phone, email',
        });
      }

      // Validate slug format
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({
          success: false,
          message: 'Slug chỉ được chứa chữ thường, số và dấu gạch ngang',
        });
      }

      // Kiểm tra slug chưa được dùng
      const slugTaken = await prisma.restaurant.findFirst({ where: { slug } });
      if (slugTaken) {
        return res.status(400).json({
          success: false,
          message: 'Slug này đã được sử dụng. Vui lòng chọn slug khác.',
        });
      }

      const files = req.files as Record<string, Express.Multer.File[]>;
      const timestamp = Date.now();

      // Upload files lên Cloudinary + mã hóa URL
      let logoUrl: string | undefined;
      if (files.restaurantImage?.[0]) {
        logoUrl = await uploadPublicImage(
          files.restaurantImage[0].buffer,
          'xfoodi/restaurant-logos',
          `${userId}-logo-${timestamp}`
        );
      }

      let businessLicenseEnc: string | undefined;
      let ownershipProofEnc: string | undefined;
      let nationalIdEnc: string | undefined;

      if (files.businessLicense?.[0]) {
        const url = await uploadToCloudinary(
          files.businessLicense[0].buffer,
          'xfoodi/restaurant-documents',
          `${userId}-business-license-${timestamp}`
        );
        businessLicenseEnc = encryptValue(url);
      }

      if (files.ownershipProof?.[0]) {
        const url = await uploadToCloudinary(
          files.ownershipProof[0].buffer,
          'xfoodi/restaurant-documents',
          `${userId}-ownership-proof-${timestamp}`
        );
        ownershipProofEnc = encryptValue(url);
      }

      if (files.nationalId?.[0]) {
        const url = await uploadToCloudinary(
          files.nationalId[0].buffer,
          'xfoodi/restaurant-documents',
          `${userId}-national-id-front-${timestamp}`
        );
        nationalIdEnc = encryptValue(url);
      }

      let nationalIdBackEnc: string | undefined;
      if (files.nationalIdBack?.[0]) {
        const url = await uploadToCloudinary(
          files.nationalIdBack[0].buffer,
          'xfoodi/restaurant-documents',
          `${userId}-national-id-back-${timestamp}`
        );
        nationalIdBackEnc = encryptValue(url);
      }

      const application = await prisma.restaurantApplication.create({
        data: {
          userId,
          restaurantName,
          slug: slug.toLowerCase().trim(),
          description: description || null,
          address,
          phone,
          email,
          logoUrl: logoUrl || null,
          latitude,
          longitude,
          cuisineType: cuisineType || 'other',
          businessLicenseEnc,
          ownershipProofEnc,
          nationalIdEnc,
          nationalIdBackEnc,
          status: 'PENDING',
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Đơn đăng ký đã được gửi thành công. Chúng tôi sẽ xem xét trong 1-3 ngày làm việc.',
        data: {
          id: application.id,
          status: application.status,
          restaurantName: application.restaurantName,
          createdAt: application.createdAt,
        },
      });
    } catch (error) {
      console.error('[RestaurantApplication] Create error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/restaurant-applications/my
// Customer xem trạng thái đơn của mình
// ──────────────────────────────────────────────────────────────────────────────
router.get('/my', authMiddleware, async (req: any, res: any) => {
  try {
    const userId: string = req.user.sub;
    const application = await prisma.restaurantApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        restaurantName: true,
        slug: true,
        description: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        // Do NOT return encrypted docs — not needed for status check
      },
    });

    return res.json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error('[RestaurantApplication] Get my error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/restaurant-applications
// Admin xem danh sách tất cả đơn
// Query: ?status=PENDING|APPROVED|REJECTED
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status as string)) {
      where.status = status;
    }

    const [applications, total] = await Promise.all([
      prisma.restaurantApplication.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          restaurantName: true,
          slug: true,
          address: true,
          phone: true,
          email: true,
          status: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          user: {
            select: { id: true, fullName: true, email: true, avatarUrl: true },
          },
          reviewer: {
            select: { id: true, fullName: true },
          },
        },
      }),
      prisma.restaurantApplication.count({ where }),
    ]);

    return res.json({
      success: true,
      data: {
        items: applications,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('[RestaurantApplication] List error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/restaurant-applications/:id
// Admin xem chi tiết 1 đơn — decrypt URL tài liệu để hiển thị
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const application = await prisma.restaurantApplication.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, phoneNumber: true, avatarUrl: true } },
        reviewer: { select: { id: true, fullName: true } },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    // Decrypt document URLs for admin review
    const documents = {
      businessLicenseUrl: application.businessLicenseEnc
        ? decryptValue(application.businessLicenseEnc)
        : null,
      ownershipProofUrl: application.ownershipProofEnc
        ? decryptValue(application.ownershipProofEnc)
        : null,
      nationalIdFrontUrl: application.nationalIdEnc
        ? decryptValue(application.nationalIdEnc)
        : null,
      nationalIdBackUrl: application.nationalIdBackEnc
        ? decryptValue(application.nationalIdBackEnc)
        : null,
    };

    return res.json({
      success: true,
      data: {
        ...application,
        // Replace encrypted fields with decrypted URLs
        businessLicenseEnc: undefined,
        ownershipProofEnc: undefined,
        nationalIdEnc: undefined,
        documents,
      },
    });
  } catch (error) {
    console.error('[RestaurantApplication] Detail error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/restaurant-applications/:id/approve
// Admin duyệt đơn → tạo Restaurant + set role Owner + gửi email
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/approve', authMiddleware, requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const adminId: string = req.user.sub;

    const application = await prisma.restaurantApplication.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, passwordHash: true, phoneNumber: true } },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Đơn đã ở trạng thái ${application.status}, không thể duyệt lại`,
      });
    }

    // Check user doesn't already own a restaurant
    const existingOwnerRole = await prisma.userRole.findFirst({
      where: {
        userId: application.userId,
        role: { name: 'Owner' },
      },
      include: { role: true },
    });

    if (existingOwnerRole) {
      return res.status(409).json({
        success: false,
        message: 'User đã là Owner của một nhà hàng khác',
      });
    }

    // Create the Restaurant and update application in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Create Restaurant
      const restaurant = await tx.restaurant.create({
        data: {
          name: application.restaurantName,
          slug: application.slug,
          ownerId: application.userId,
          description: application.description,
          address: application.address,
          phone: application.phone,
          email: application.email,
          logoUrl: application.logoUrl || null,
          latitude: application.latitude || null,
          longitude: application.longitude || null,
          cuisineType: application.cuisineType || 'other',
          isActive: true,
        },
      });

      // 2. Mark application APPROVED
      const updated = await tx.restaurantApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      return { restaurant, updated };
    });

    // 3. Assign Owner role in central database (outside transaction to avoid nesting issues)
    await assignDefaultRole(application.userId, 'Owner', result.restaurant.id);

    try {
      // 3.1. Programmatically run Prisma migrations on the new tenant's database schema
      await runMigrationsForTenant(result.restaurant.slug);

      // 3.2. Seed the new tenant's database with default roles and the Owner account
      await seedTenantDatabase(result.restaurant.slug, {
        id: application.user.id,
        email: application.user.email!,
        fullName: application.user.fullName || '',
        phoneNumber: application.user.phoneNumber || undefined,
        passwordHash: application.user.passwordHash || undefined,
      });
    } catch (dbError) {
      console.error('[RestaurantApplication] Failed to initialize tenant database:', dbError);
      // We log the error but don't crash the response since the central restaurant object was already successfully created.
      // In production, we might want to flag this restaurant as "DB_PROVISION_FAILED" or similar.
    }

    // 4. Send approval email (fire and forget)
    sendApplicationApprovedEmail(
      application.user.email!,
      application.user.fullName || 'Bạn',
      application.restaurantName
    ).catch((e) => console.error('[Email] Approval email failed:', e));

    return res.json({
      success: true,
      message: 'Đã duyệt đơn. Nhà hàng đã được tạo và email thông báo đã được gửi.',
      data: {
        restaurantId: result.restaurant.id,
        restaurantSlug: result.restaurant.slug,
      },
    });
  } catch (error) {
    console.error('[RestaurantApplication] Approve error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/restaurant-applications/:id/reject
// Admin từ chối đơn → gửi email với lý do
// Body: { reason: string }
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/reject', authMiddleware, requireRole('Admin', 'SuperAdmin'), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const adminId: string = req.user.sub;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Lý do từ chối là bắt buộc' });
    }

    const application = await prisma.restaurantApplication.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Đơn đã ở trạng thái ${application.status}, không thể từ chối`,
      });
    }

    await prisma.restaurantApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewNote: reason.trim(),
        reviewedAt: new Date(),
      },
    });

    // Send rejection email (fire and forget)
    sendApplicationRejectedEmail(
      application.user.email!,
      application.user.fullName || 'Bạn',
      application.restaurantName,
      reason.trim()
    ).catch((e) => console.error('[Email] Rejection email failed:', e));

    return res.json({
      success: true,
      message: 'Đã từ chối đơn và gửi email thông báo đến người dùng.',
    });
  } catch (error) {
    console.error('[RestaurantApplication] Reject error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
