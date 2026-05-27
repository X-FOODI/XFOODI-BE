export function mapNotificationRealtimePayload(row: {
  id: string;
  type: string;
  postId: string | null;
  commentId: string | null;
  message: string | null;
  read: boolean;
  createdAt: Date;
  actor: {
    id: string;
    fullName: string | null;
    userName: string | null;
    avatarUrl: string | null;
  };
}) {
  const type = row.type.toLowerCase();
  return {
    id: row.id,
    type,
    postId: row.postId ?? undefined,
    commentId: row.commentId ?? undefined,
    message: row.message ?? '',
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    actor: {
      id: row.actor.id,
      username: row.actor.userName ?? row.actor.id,
      fullName: row.actor.fullName ?? undefined,
      avatarUrl: row.actor.avatarUrl ?? undefined,
    },
  };
}
