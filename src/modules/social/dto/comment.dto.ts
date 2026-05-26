import { parseContentMeta } from '../utils/content.util';

const authorSelect = {
  id: true,
  fullName: true,
  userName: true,
  avatarUrl: true,
} as const;

export const commentInclude = {
  user: { select: authorSelect },
  replies: {
    include: {
      user: { select: authorSelect },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

export type CommentWithRelations = {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    fullName: string | null;
    userName: string | null;
    avatarUrl: string | null;
  };
  replies?: CommentWithRelations[];
};

function mapCommentBase(comment: CommentWithRelations) {
  const meta = parseContentMeta(comment.content);
  return {
    id: comment.id,
    postId: comment.postId,
    userId: comment.userId,
    parentId: comment.parentId,
    content: comment.content,
    hashtags: meta.hashtags,
    mentions: meta.mentions,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    user: {
      id: comment.user.id,
      fullName: comment.user.fullName,
      userName: comment.user.userName,
      avatarUrl: comment.user.avatarUrl,
    },
  };
}

export function mapComment(comment: CommentWithRelations) {
  return {
    ...mapCommentBase(comment),
    replies: (comment.replies ?? []).map((r) => mapCommentBase(r)),
  };
}
