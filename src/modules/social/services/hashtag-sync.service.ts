import { parseContentMeta } from '../utils/content.util';
import { hashtagRepository } from '../repositories/hashtag.repository';

export async function syncPostHashtags(postId: string, content: string): Promise<void> {
  const { hashtags } = parseContentMeta(content);
  const normalized = [...new Set(hashtags.map((t) => t.toLowerCase()))];
  if (normalized.length === 0) {
    await hashtagRepository.unlinkPost(postId);
    return;
  }

  const records = await hashtagRepository.upsertTags(normalized);
  const oldLinks = await hashtagRepository.unlinkPost(postId);
  void oldLinks;
  await hashtagRepository.linkPostToHashtags(
    postId,
    records.map((r) => r.id)
  );
  await hashtagRepository.incrementCounts(
    records.map((r) => r.id),
    1
  );
}
