import type { RequestHandler } from 'express';
import {
  listEmployees,
  getEmployeeDetail,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  resetEmployeePassword,
  EmployeeServiceError,
} from '../services/employee.service';
import {
  validateCreateEmployee,
  validateUpdateEmployee,
  validateResetPassword,
} from '../validators/employee.validator';

// Helper to extract restaurantId from user token (JWT) or headers or query
function getRestaurantId(req: any): string | null {
  if (req.user?.restaurantId) {
    return req.user.restaurantId as string;
  }
  if (req.query?.restaurantId) {
    return req.query.restaurantId as string;
  }
  if (req.body?.restaurantId) {
    return req.body.restaurantId as string;
  }
  if (req.tenantId) {
    return req.tenantId as string;
  }
  return null;
}

// Standardized error handler
function handleEmployeeError(res: any, err: unknown): void {
  if (err instanceof EmployeeServiceError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }
  const error = err as Error;
  console.error('[EmployeeController] Error:', error.message, error.stack);
  res.status(500).json({ success: false, message: 'Lỗi hệ thống.' });
}

export const handleListEmployees: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.'
      });
    }

    const result = await listEmployees(restaurantId, req.query as any);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    handleEmployeeError(res, err);
  }
};

export const handleGetEmployeeDetail: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.'
      });
    }

    const id = req.params.id as string;
    const detail = await getEmployeeDetail(restaurantId, id);
    res.json({
      success: true,
      data: detail
    });
  } catch (err) {
    handleEmployeeError(res, err);
  }
};

export const handleCreateEmployee: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.'
      });
    }

    const { valid, errors } = validateCreateEmployee(req.body);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const created = await createEmployee(restaurantId, req.body);
    res.status(201).json({
      success: true,
      message: 'Nhân viên đã được tạo thành công.',
      data: created
    });
  } catch (err) {
    handleEmployeeError(res, err);
  }
};

export const handleUpdateEmployee: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.'
      });
    }

    const { valid, errors } = validateUpdateEmployee(req.body);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const id = req.params.id as string;
    const updated = await updateEmployee(restaurantId, id, req.body);
    res.json({
      success: true,
      message: 'Thông tin nhân viên đã được cập nhật thành công.',
      data: updated
    });
  } catch (err) {
    handleEmployeeError(res, err);
  }
};

export const handleDeleteEmployee: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.'
      });
    }

    const id = req.params.id as string;
    await deleteEmployee(restaurantId, id);
    res.json({
      success: true,
      message: 'Nhân viên đã được xóa thành công.'
    });
  } catch (err) {
    handleEmployeeError(res, err);
  }
};

export const handleResetEmployeePassword: RequestHandler = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required.'
      });
    }

    const { valid, errors } = validateResetPassword(req.body);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: errors.join('; ')
      });
    }

    const id = req.params.id as string;
    await resetEmployeePassword(restaurantId, id, req.body);
    res.json({
      success: true,
      message: 'Mật khẩu nhân viên đã được đặt lại thành công.'
    });
  } catch (err) {
    handleEmployeeError(res, err);
  }
};
