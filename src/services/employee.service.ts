import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

export class EmployeeServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface ListEmployeesQuery {
  search?: string;
  role?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number | string;
  limit?: number | string;
}

/**
 * Helper to generate scoped email/username based on restaurant slug
 */
async function getScopedCredentials(restaurantId: string, email: string, username: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { slug: true }
  });

  if (!restaurant) {
    throw new EmployeeServiceError('Không tìm thấy nhà hàng.', 404);
  }

  const prefix = restaurant.slug.trim().toLowerCase();
  return {
    scopedEmail: `${prefix}:${email.trim().toLowerCase()}`,
    scopedUsername: `${prefix}:${username.trim().toLowerCase()}`,
    restaurantSlug: restaurant.slug
  };
}

/**
 * Helper to clean email from scope prefix (e.g. "slug:email@example.com" -> "email@example.com")
 */
export function cleanScopedEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.includes(':') ? email.substring(email.indexOf(':') + 1) : email;
}

export async function listEmployees(restaurantId: string, query: ListEmployeesQuery) {
  const page = Math.max(1, parseInt(query.page as string || '1', 10));
  const limit = Math.max(1, parseInt(query.limit as string || '10', 10));
  const skip = (page - 1) * limit;

  const whereClause: any = {
    restaurantId,
  };

  // Status filter (Active / Inactive)
  if (query.status === 'ACTIVE') {
    whereClause.isActive = true;
  } else if (query.status === 'INACTIVE') {
    whereClause.isActive = false;
  } else if (!query.status) {
    // Default to active only if not specified
    whereClause.isActive = true;
  }

  // Search filter (FullName, Username, Email)
  if (query.search && query.search.trim()) {
    const searchVal = query.search.trim().toLowerCase();
    whereClause.OR = [
      {
        user: {
          fullName: { contains: searchVal, mode: 'insensitive' }
        }
      },
      {
        user: {
          userName: { contains: searchVal, mode: 'insensitive' }
        }
      },
      {
        user: {
          email: { contains: searchVal, mode: 'insensitive' }
        }
      }
    ];
  }

  // Role filter
  if (query.role && query.role !== 'ALL') {
    whereClause.user = {
      ...whereClause.user,
      roles: {
        some: {
          role: {
            name: { equals: query.role, mode: 'insensitive' }
          },
          restaurantId
        }
      }
    };
  }

  // Sorting
  let orderBy: any = { createdAt: 'desc' };
  if (query.sortBy) {
    if (query.sortBy === 'name') {
      orderBy = {
        user: {
          fullName: query.sortOrder || 'asc'
        }
      };
    } else if (query.sortBy === 'createdAt') {
      orderBy = { createdAt: query.sortOrder || 'desc' };
    }
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where: whereClause,
      include: {
        user: {
          include: {
            roles: {
              where: { restaurantId },
              include: { role: true }
            }
          }
        }
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.employee.count({
      where: whereClause
    })
  ]);

  const items = employees.map((emp) => {
    const user = emp.user;
    const rolesList = user?.roles.map((ur) => ur.role.name) || [];
    const role = rolesList.length > 0 ? rolesList[0] : 'Waiter';

    return {
      id: emp.id,
      userId: user?.id || null,
      fullName: user?.fullName || '',
      username: cleanScopedEmail(user?.userName) || '',
      email: cleanScopedEmail(user?.email) || '',
      phone: user?.phoneNumber || '',
      avatar: user?.avatarUrl || '',
      role,
      position: emp.position,
      status: emp.isActive && user?.isActive ? 'ACTIVE' : 'INACTIVE',
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
      lastLogin: user?.lastLoginAt || null,
    };
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

export async function getEmployeeDetail(restaurantId: string, id: string) {
  const emp = await prisma.employee.findFirst({
    where: { id, restaurantId },
    include: {
      user: {
        include: {
          roles: {
            where: { restaurantId },
            include: { role: true }
          }
        }
      }
    }
  });

  if (!emp) {
    throw new EmployeeServiceError('Không tìm thấy nhân viên.', 404);
  }

  const user = emp.user;
  const rolesList = user?.roles.map((ur) => ur.role.name) || [];
  const role = rolesList.length > 0 ? rolesList[0] : 'Waiter';

  return {
    id: emp.id,
    userId: user?.id || null,
    fullName: user?.fullName || '',
    username: cleanScopedEmail(user?.userName) || '',
    email: cleanScopedEmail(user?.email) || '',
    phone: user?.phoneNumber || '',
    avatar: user?.avatarUrl || '',
    role,
    position: emp.position,
    status: emp.isActive && user?.isActive ? 'ACTIVE' : 'INACTIVE',
    createdAt: emp.createdAt,
    updatedAt: emp.updatedAt,
    lastLogin: user?.lastLoginAt || null,
  };
}

export async function createEmployee(restaurantId: string, data: any) {
  const { fullName, username, email, phone, password, role, position, status } = data;

  const { scopedEmail, scopedUsername } = await getScopedCredentials(restaurantId, email, username);

  // Check if email or username is already taken globally or within scope
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: scopedEmail },
        { userName: scopedUsername }
      ]
    }
  });

  if (existingUser) {
    throw new EmployeeServiceError('Email hoặc Tên tài khoản đã tồn tại trong hệ thống.');
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Use transaction to create User, assign Role, and create Employee
  return await prisma.$transaction(async (tx) => {
    // 1. Create User
    const user = await tx.user.create({
      data: {
        email: scopedEmail,
        userName: scopedUsername,
        passwordHash,
        fullName,
        phoneNumber: phone,
        emailVerified: true, // Auto-verified since admin creates the account
        isActive: status === 'ACTIVE',
      }
    });

    // 2. Assign Role for this restaurant
    let dbRole = await tx.role.findFirst({
      where: { name: { equals: role, mode: 'insensitive' } }
    });

    if (!dbRole) {
      dbRole = await tx.role.create({
        data: { name: role }
      });
    }

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId: dbRole.id,
        restaurantId
      }
    });

    // 3. Create Employee entry
    const employee = await tx.employee.create({
      data: {
        code: 'EMP-' + Math.floor(100000 + Math.random() * 900000), // Unique employee code
        restaurantId,
        userId: user.id,
        position,
        hireDate: new Date(),
        salary: 0,
        salaryType: 'MONTHLY',
        isActive: status === 'ACTIVE',
      }
    });

    return {
      id: employee.id,
      userId: user.id,
      fullName: user.fullName,
      email: cleanScopedEmail(user.email),
      role,
      position: employee.position,
      status: employee.isActive ? 'ACTIVE' : 'INACTIVE'
    };
  });
}

export async function updateEmployee(restaurantId: string, id: string, data: any) {
  const { fullName, email, phone, role, position, status } = data;

  const emp = await prisma.employee.findFirst({
    where: { id, restaurantId },
    include: { user: true }
  });

  if (!emp) {
    throw new EmployeeServiceError('Không tìm thấy nhân viên.', 404);
  }

  const user = emp.user;
  if (!user) {
    throw new EmployeeServiceError('Không tìm thấy tài khoản người dùng tương ứng.', 404);
  }

  const { scopedEmail } = await getScopedCredentials(restaurantId, email, user.userName || '');

  // Check email uniqueness if email changed
  if (email.trim().toLowerCase() !== cleanScopedEmail(user.email).toLowerCase()) {
    const emailConflict = await prisma.user.findFirst({
      where: { email: scopedEmail }
    });
    if (emailConflict) {
      throw new EmployeeServiceError('Email mới đã được sử dụng bởi người dùng khác.');
    }
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Update User details
    await tx.user.update({
      where: { id: user.id },
      data: {
        fullName,
        email: scopedEmail,
        phoneNumber: phone,
        isActive: status === 'ACTIVE'
      }
    });

    // 2. Update Role (Remove existing roles for this restaurant, add new one)
    await tx.userRole.deleteMany({
      where: {
        userId: user.id,
        restaurantId
      }
    });

    let dbRole = await tx.role.findFirst({
      where: { name: { equals: role, mode: 'insensitive' } }
    });

    if (!dbRole) {
      dbRole = await tx.role.create({
        data: { name: role }
      });
    }

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId: dbRole.id,
        restaurantId
      }
    });

    // 3. Update Employee details
    const updatedEmployee = await tx.employee.update({
      where: { id: emp.id },
      data: {
        position,
        isActive: status === 'ACTIVE'
      }
    });

    return {
      id: updatedEmployee.id,
      fullName,
      email,
      role,
      position,
      status: updatedEmployee.isActive ? 'ACTIVE' : 'INACTIVE'
    };
  });
}

export async function deleteEmployee(restaurantId: string, id: string) {
  const emp = await prisma.employee.findFirst({
    where: { id, restaurantId }
  });

  if (!emp) {
    throw new EmployeeServiceError('Không tìm thấy nhân viên.', 404);
  }

  // Perform soft delete
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: { isActive: false }
    });

    if (emp.userId) {
      await tx.user.update({
        where: { id: emp.userId },
        data: { isActive: false }
      });
    }
  });

  return true;
}

export async function resetEmployeePassword(restaurantId: string, id: string, data: any) {
  const { newPassword } = data;

  const emp = await prisma.employee.findFirst({
    where: { id, restaurantId }
  });

  if (!emp || !emp.userId) {
    throw new EmployeeServiceError('Không tìm thấy nhân viên.', 404);
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  await prisma.user.update({
    where: { id: emp.userId },
    data: { passwordHash }
  });

  return true;
}
