import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  const posts = await prisma.socialPost.count();
  const images = await prisma.socialImage.count();
  const comments = await prisma.socialComment.count();
  const reactions = await prisma.socialReaction.count();
  const hashtags = await prisma.socialHashtag.count();
  const follows = await prisma.socialFollow.count();
  const users = await prisma.user.count();

  console.log('=== SOCIAL SEED VERIFICATION ===');
  console.log(`Users count: ${users}`);
  console.log(`Posts count: ${posts}`);
  console.log(`Images count: ${images}`);
  console.log(`Comments count: ${comments}`);
  console.log(`Reactions (Likes/Hearts) count: ${reactions}`);
  console.log(`Hashtags count: ${hashtags}`);
  console.log(`Follows count: ${follows}`);

  const samplePost = await prisma.socialPost.findFirst({
    include: {
      author: { select: { fullName: true, avatarUrl: true } },
      images: true,
      comments: { include: { user: { select: { fullName: true } } } },
      reactions: true,
    },
  });

  console.log('\nSample Seeded Post:');
  console.log(`Author: ${samplePost?.author.fullName}`);
  console.log(`Content: ${samplePost?.content.slice(0, 100)}...`);
  console.log(`Images: ${samplePost?.images.length}`);
  console.log(`Reactions count: ${samplePost?.reactions.length}`);
  console.log(`Comments count: ${samplePost?.comments.length}`);
}

verify()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
