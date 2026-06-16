import { mapPost, type PostWithRelations } from './post.dto';

type PostWithVisibility = PostWithRelations & {
  visibility?: string;
  repostOfId?: string | null;
};

export function mapPostCommunity(post: PostWithVisibility, viewerId?: string) {
  const base = mapPost(post, viewerId);
  return {
    ...base,
    visibility: post.visibility ?? 'public',
    repostOfId: post.repostOfId ?? null,
  };
}
