import { profileRepository } from '../repositories/profile.repository';
import { followRepository } from '../repositories/follow.repository';
import { centralPrisma as prisma } from '../../../lib/prisma';
import { SocialServiceError } from '../middlewares/social.errors';
import type { UpdateSocialProfileBody } from '../interfaces/community.types';

export async function getSocialProfile(userId: string, viewerId?: string) {
  const user = await profileRepository.findById(userId);
  if (!user) {
    throw new SocialServiceError('User not found', 404);
  }

  const [followersCount, followingCount, postsCount] = await Promise.all([
    followRepository.countFollowers(userId),
    followRepository.countFollowing(userId),
    prisma.socialPost.count({ where: { authorId: userId } }),
  ]);

  let isFollowing = false;
  if (viewerId && viewerId !== userId) {
    const row = await followRepository.exists(viewerId, userId);
    isFollowing = !!row;
  }

  return {
    ...user,
    stats: { followersCount, followingCount, postsCount },
    isFollowing,
    isOwner: viewerId === userId,
  };
}

export async function updateSocialProfile(userId: string, body: UpdateSocialProfileBody) {
  const data: UpdateSocialProfileBody = {};
  if (body.bio !== undefined) data.bio = body.bio?.slice(0, 500);
  if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
  if (body.fullName !== undefined) data.fullName = body.fullName;

  if (Object.keys(data).length === 0) {
    throw new SocialServiceError('No fields to update', 400);
  }

  await profileRepository.update(userId, data);
  return getSocialProfile(userId, userId);
}
