import { parseContentMeta } from '../utils/content.util';
import { encodeCursor } from '../utils/pagination.util';
import type { AuthorSummary } from '../interfaces/social.types';

const authorSelect = {
  id: true,
  fullName: true,
  userName: true,
  avatarUrl: true,
} as const;

export const postInclude = {
  author: { select: authorSelect },
  images: true,
  reactions: true,
  comments: { select: { id: true } },
  shares: { select: { id: true } },
  savedBy: { select: { userId: true } },
} as const;

export type PostWithRelations = {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: AuthorSummary;
  images: { id: string; postId: string; imageUrl: string }[];
  reactions: { id: string; postId: string; userId: string; type: string; createdAt: Date }[];
  comments: { id: string }[];
  shares: { id: string }[];
  savedBy: { userId: string }[];
};

export function mapAuthor(author: AuthorSummary) {
  return {
    id: author.id,
    fullName: author.fullName,
    userName: author.userName,
    avatarUrl: author.avatarUrl,
  };
}

export function mapPost(post: PostWithRelations, viewerId?: string) {
  const meta = parseContentMeta(post.content ?? '');
  const reactionCounts = post.reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});

  const viewerReaction = viewerId
    ? post.reactions.find((r) => r.userId === viewerId) ?? null
    : null;

  return {
    id: post.id,
    authorId: post.authorId,
    content: post.content,
    hashtags: meta.hashtags,
    mentions: meta.mentions,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: mapAuthor(post.author),
    images: post.images.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
    })),
    stats: {
      commentCount: post.comments.length,
      shareCount: post.shares.length,
      reactionCount: post.reactions.length,
      reactionCounts,
    },
    viewer: viewerId
      ? {
          reaction: viewerReaction ? { type: viewerReaction.type } : null,
          saved: post.savedBy.some((s) => s.userId === viewerId),
        }
      : undefined,
  };
}

export function mapPostList(
  posts: PostWithRelations[],
  viewerId?: string,
  hasMore = false
) {
  const nextCursor =
    hasMore && posts.length > 0
      ? encodeCursor(posts[posts.length - 1].createdAt, posts[posts.length - 1].id)
      : null;

  return {
    items: posts.map((p) => mapPost(p, viewerId)),
    pagination: {
      nextCursor,
      hasMore,
    },
  };
}
