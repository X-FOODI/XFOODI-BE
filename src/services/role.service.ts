import { prisma } from '../lib/prisma';

/**
 * Roles that CANNOT be assigned via public API (register, Google login, etc.)
 * These roles must be assigned manually by a system administrator.
 */
const PROTECTED_ROLES = ['Admin', 'SuperAdmin'];

/**
 * Default role assigned to new users on registration or Google sign-in.
 */
const DEFAULT_ROLE_NAME = 'Customer';

/**
 * Find or create a role by name, then link it to the given user.
 * Skips assignment if the user already has the role.
 *
 * @param userId - The ID of the user to assign the role to
 * @param roleName - The name of the role (defaults to "Customer")
 * @throws Error if the requested role is protected (e.g. Admin)
 */
export async function assignDefaultRole(
  userId: string,
  roleName: string = DEFAULT_ROLE_NAME,
  restaurantId?: string
): Promise<void> {
  // Prevent assigning protected roles via API
  if (PROTECTED_ROLES.includes(roleName)) {
    throw new Error(`Role "${roleName}" cannot be assigned via API`);
  }

  // Find or create the role
  let role = await prisma.role.findFirst({
    where: { name: { equals: roleName, mode: 'insensitive' } },
  });

  if (!role) {
    role = await prisma.role.create({
      data: { name: roleName },
    });
    console.log(`[RoleService] Created new role: ${roleName}`);
  }

  // Check if user already has this role
  const existing = await prisma.userRole.findFirst({
    where: {
      userId,
      roleId: role.id,
      restaurantId: restaurantId ?? null,
    },
  });

  if (!existing) {
    await prisma.userRole.create({
      data: { userId, roleId: role.id, ...(restaurantId && { restaurantId }) },
    });
    console.log(`[RoleService] Assigned role "${roleName}" to user ${userId}`);
  }
}

/**
 * Check if a role name is protected (cannot be assigned via API).
 */
export function isProtectedRole(roleName: string): boolean {
  return PROTECTED_ROLES.includes(roleName);
}
