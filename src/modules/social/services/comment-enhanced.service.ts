import * as commentService from './comment.service';
import { postRepository } from '../repositories/post.repository';
import { notify } from './notification.service';
import { parseContentMeta } from '../utils/content.util';
import type { CreateCommentBody } from '../interfaces/social.types';

export async function createCommentWithNotification(userId: string, body: CreateCommentBody) {
  const comment = await commentService.createComment(userId, body);
  const post = await postRepository.findById(body.postId);

  if (post && post.authorId !== userId) {
    await notify({
      userId: post.authorId,
      actorId: userId,
      type: 'COMMENT',
      postId: body.postId,
      commentId: comment.id,
      message: 'commented on your post',
    });
  }

  const meta = parseContentMeta(body.content);
  const { prisma } = await import('../../../lib/prisma');
  for (const mention of meta.mentions) {
    const user = await prisma.user.findFirst({
      where: { userName: { equals: mention, mode: 'insensitive' } },
      select: { id: true },
    });
    if (user && user.id !== userId) {
      await notify({
        userId: user.id,
        actorId: userId,
        type: 'MENTION',
        postId: body.postId,
        commentId: comment.id,
        message: 'mentioned you in a comment',
      });
    }
  }

  return comment;
}
