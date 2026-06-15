export const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CreatePostBody {
  content: string;
  imageUrls?: string[];
}

export interface UpdatePostBody {
  content?: string;
  imageUrls?: string[];
}

export interface ListPostsQuery {
  cursor?: string;
  limit?: string;
  hashtag?: string;
  authorId?: string;
}

export interface CreateCommentBody {
  postId: string;
  content: string;
  parentId?: string;
}

export interface UpdateCommentBody {
  content: string;
}

export interface CreateReactionBody {
  postId: string;
  type: ReactionType;
}

export interface ParsedContentMeta {
  hashtags: string[];
  mentions: string[];
}

export interface AuthorSummary {
  id: string;
  fullName: string | null;
  userName: string | null;
  avatarUrl: string | null;
}

export interface PostListMeta {
  nextCursor: string | null;
  hasMore: boolean;
}
