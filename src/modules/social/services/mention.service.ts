import { prisma } from '../../../lib/prisma';
import { parseContentMeta } from '../utils/content.util';
import { SocialServiceError } from '../middlewares/social.errors';

/**
 * Validates @mentions in content refer to existing users (by userName).
 */
export async function validateMentionsInContent(content: string): Promise<void> {
  const { mentions } = parseContentMeta(content);
  if (mentions.length === 0) return;

  const users = await prisma.user.findMany({
    where: {
      userName: { in: mentions },
      isActive: true,
    },
    select: { userName: true },
  });

  const found = new Set(users.map((u) => u.userName).filter(Boolean));
  const missing = mentions.filter((m) => !found.has(m));

  if (missing.length > 0) {
    throw new SocialServiceError(`Unknown user mention(s): ${missing.join(', ')}`, 400);
  }
}
