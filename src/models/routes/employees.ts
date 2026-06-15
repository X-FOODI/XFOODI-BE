import { Router, type Router as ExpressRouter } from 'express';
import { authMiddleware } from './auth';
import { tenantGuard } from '../../middlewares/tenantGuard';
import { requireRole } from '../../middlewares/requireRole';
import {
  handleListEmployees,
  handleGetEmployeeDetail,
  handleCreateEmployee,
  handleUpdateEmployee,
  handleDeleteEmployee,
  handleResetEmployeePassword,
} from '../../controllers/employee.controller';
import { auditLogMiddleware } from '../../middlewares/auditLog';

const router: ExpressRouter = Router();

// Protect all routes with auth, audit logging, tenant check, and role checks
router.use(authMiddleware);
router.use(tenantGuard);
router.use(requireRole('Admin', 'SuperAdmin', 'System Admin', 'Owner'));
router.use(auditLogMiddleware);

// GET /api/employees - list employees
router.get('/', handleListEmployees);

// GET /api/employees/:id - get employee details
router.get('/:id', handleGetEmployeeDetail);

// POST /api/employees - create employee
router.post('/', handleCreateEmployee);

// PUT /api/employees/:id - update employee
router.put('/:id', handleUpdateEmployee);

// DELETE /api/employees/:id - delete employee (soft delete)
router.delete('/:id', handleDeleteEmployee);

// PATCH /api/employees/:id/reset-password - reset employee password
router.patch('/:id/reset-password', handleResetEmployeePassword);

export default router;
