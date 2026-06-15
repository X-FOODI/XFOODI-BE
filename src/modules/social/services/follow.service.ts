import { followRepository } from '../repositories/follow.repository';
import { SocialServiceError } from '../middlewares/social.errors';
import { notify } from './notification.service';

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new SocialServiceError('Cannot follow yourself', 400);
  }

  const existing = await followRepository.exists(followerId, followingId);
  if (existing) {
    return { following: true, followersCount: await followRepository.countFollowers(followingId) };
  }

  await followRepository.follow(followerId, followingId);
  await notify({
    userId: followingId,
    actorId: followerId,
    type: 'FOLLOW',
    message: 'started following you',
  });

  const [followersCount, followingCount] = await Promise.all([
    followRepository.countFollowers(followingId),
    followRepository.countFollowing(followerId),
  ]);

  return { following: true, followersCount, followingCount };
}

export async function unfollowUser(followerId: string, followingId: string) {
  await followRepository.unfollow(followerId, followingId);
  const [followersCount, followingCount] = await Promise.all([
    followRepository.countFollowers(followingId),
    followRepository.countFollowing(followerId),
  ]);
  return { following: false, followersCount, followingCount };
}

export async function getFollowStats(userId: string) {
  const [followersCount, followingCount] = await Promise.all([
    followRepository.countFollowers(userId),
    followRepository.countFollowing(userId),
  ]);
  return { followersCount, followingCount };
}

export async function listFollowers(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const rows = await followRepository.listFollowers(userId, limit, skip);
  return { items: rows.map((r) => r.follower), page, limit };
}

export async function listFollowing(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const rows = await followRepository.listFollowing(userId, limit, skip);
  return { items: rows.map((r) => r.following), page, limit };
}

export async function isFollowing(followerId: string, followingId: string) {
  const row = await followRepository.exists(followerId, followingId);
  return { following: !!row };
}
