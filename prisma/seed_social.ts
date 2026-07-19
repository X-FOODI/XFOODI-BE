import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting Social Media Seed Script...');

  // 1. Fetch existing users or create realistic foodie accounts
  let users = await prisma.user.findMany();
  console.log(`Found ${users.length} existing users in database.`);

  const sampleUsersData = [
    {
      userName: 'thaonguyen_foodie',
      email: 'thaonguyen.foodie@gmail.com',
      fullName: 'Thảo Nguyên | Food Blogger',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80',
      bio: 'Đam mê khám phá ẩm thực Hà Nội & Sài Gòn 🍜 | Food Reviewer 📸',
    },
    {
      userName: 'minhtuan_chef',
      email: 'minhtuan.chef@gmail.com',
      fullName: 'Minh Tuấn (Chef Tuấn)',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
      bio: 'Đầu bếp đồ Nướng & Bia Thủ Công 🍺 | Thích chia sẻ công thức ướp thịt chuẩn vị',
    },
    {
      userName: 'honghanh_eat',
      email: 'honghanh.eatclean@gmail.com',
      fullName: 'Hồng Hạnh | Eat Clean & Cafe',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80',
      bio: 'Góc ăn uống heo-thì & Chill cuối tuần ☕️ | HaNoi Cuisine Lover',
    },
    {
      userName: 'hoangnam_vlog',
      email: 'hoangnam.streetfood@gmail.com',
      fullName: 'Hoàng Nam Phố',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80',
      bio: 'Săn lùng quán nhậu ngon - bổ - rẻ khắp đất Sài Thành 🍻',
    },
    {
      userName: 'linhchi_sweet',
      email: 'linhchi.pastry@gmail.com',
      fullName: 'Linh Chi',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80',
      bio: 'Thánh đồ ngọt & Trà sữa 🍵🍰',
    },
  ];

  for (const u of sampleUsersData) {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: u.email }, { userName: u.userName }] },
    });
    if (!existing) {
      const created = await prisma.user.create({
        data: {
          userName: u.userName,
          email: u.email,
          fullName: u.fullName,
          avatarUrl: u.avatarUrl,
          bio: u.bio,
          provider: 'local',
          emailVerified: true,
        },
      });
      users.push(created);
      console.log(`Created user: ${created.fullName} (${created.userName})`);
    }
  }

  // Reload all users to have complete list for random authoring/reacting/commenting
  users = await prisma.user.findMany();
  if (users.length === 0) {
    console.error('No users available for social seed.');
    return;
  }

  // 2. Sample Social Posts Data with HD Food Photos & Rich Text
  const postsData = [
    {
      authorEmail: 'thaonguyen.foodie@gmail.com',
      content: `🔥 PHÁT HIỆN TỌA ĐỘ BIA HƠI & NƯỚNG BBQ SIÊU ĐỈNH TẠI GẠO BEER!

Cuối tuần chill cùng hội bạn thân tại Gạo Beer & BBQ đúng là quyết định sáng suốt nhất! 🍖🍺
- Thịt bò Mỹ nướng sốt tiêu đen mọng nước, thơm nức mũi.
- Bia gạo tươi ướp lạnh uống cực êm, không hề đau đầu.
- Không gian thoáng mát, nhân viên siêu nhiệt tình!

📍 Địa chỉ: 100 Đường Trần Hưng Đạo, Quận 1, TP. Hồ Chí Minh
⭐️ Đánh giá: 9.5/10 - Nhất định sẽ quay lại!

#gaobeer #bbq #quannhau #saigonfood #chill #reviewanngon`,
      images: [
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&q=80',
        'https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&q=80',
        'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=80',
      ],
      comments: [
        { text: 'Trông thèm quá chị ơi! Giá cả ở đây thế nào ạ?', replies: ['Dạ giá dĩa nướng tầm 120k - 250k thôi em nhé, rất vừa túi tiền!'] },
        { text: 'Bia gạo ở Gạo Beer đỉnh thật sự, uống dịu mà thơm phức luôn!', replies: [] },
        { text: 'Cuối tuần này phải dẫn gấu đi thử ngay mới được 🔥', replies: [] },
      ],
    },
    {
      authorEmail: 'minhtuan.chef@gmail.com',
      content: `🍜 BÍ QUYẾT TẠO NÊN BÁT PHỞ BÒ TRUYỀN THỐNG CHUẨN VỊ HÀ NỘI

Là một chef lâu năm, mình luôn trân trọng từng khúc xương ống được ninh liên tục 12 tiếng cùng gừng nướng, hành nướng và thảo quả thơm lừng. 
Một bát phở ngon không cần phụ gia cầu kỳ, chỉ cần tủy xương ngọt thanh tự nhiên và thớt thịt bò tươi tái mềm mịn.

Mời anh em ghé Nhà Hàng Đại Việt thưởng thức hương vị di sản này nhé! ❤️

#phohanoi #nhahangdaiviet #amthucviet #cheflife #pho`,
      images: [
        'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=1200&q=80',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80',
      ],
      comments: [
        { text: 'Nước dùng trong veo ngọt thanh chuẩn vị Hà Nội xưa luôn anh!', replies: ['Cảm ơn em nhiều nha, bí quyết ninh xương củi đấy!'] },
        { text: 'Nhìn bát phở bốc khói nghi ngút bết lòng người quá Chef ơi 🤤', replies: [] },
      ],
    },
    {
      authorEmail: 'honghanh.eatclean@gmail.com',
      content: `🥢 ĐỔ GỤC TRƯỚC KHÔNG GIAN SUSHI & FRESH SASHIMI SIÊU TINH TẾ!

Buổi tối lãng mạn tại tiệm đồ Nhật. Cá hồi tươi rói vân mỡ béo ngậy, bào ngư nướng bơ tỏi thơm nức. Thích nhất là chén trà xanh Matcha nóng chuẩn vị Kyoto thanh mát cuối bữa. 🥰✨

Mọi người thích ăn Sashimi Cá Hồi hay Cá Trừ hơn nhỉ? Cùng vote nhé! 👇

#japanese #sashimi #sushi #healthyeating #foodtour #dinner`,
      images: [
        'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=1200&q=80',
        'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=1200&q=80',
      ],
      comments: [
        { text: 'Team Cá Hồi giơ tay nào 🙌🙌🙌', replies: ['Cá hồi ở đây tươi nứt da gà luôn nè!'] },
        { text: 'Quán décor đẹp sang xịn quá chị Hạnh ơi!', replies: [] },
      ],
    },
    {
      authorEmail: 'hoangnam.streetfood@gmail.com',
      content: `🍲 TIỆM CHÁO XEKO - MÓN ĂN ẤM LÒNG NHỮNG ĐÊM SÀI GÒN SE LẠNH!

Ai là tín đồ của Cháo Sườn sụn quẩy giòn tôm nhảy thì giơ tay! ✋
Cháo ở đây sánh mịn, sụn lợn ninh mềm sần sật, rắc thêm chút tiêu bắc thơm lừng và hành hoa thái nhỏ. Ăn kèm quẩy nóng giòn tan thì đúng là combo bất bại!

📍 Tiệm Cháo Xeko - Bán từ 16h00 đến 24h00 đêm nhé cả nhà!

#chao #chaosuon #tiemchaoxeko #nightfood #saigonnight #streetfood`,
      images: [
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=1200&q=80',
      ],
      comments: [
        { text: 'Đêm muộn đi làm về ghé làm bát cháo ấm bụng đỉnh kka!', replies: [] },
        { text: 'Cháo sườn trứng bách thảo ở đây ngon bá cháy luôn anh Nam!', replies: ['Chuẩn luôn em ơi, trứng bách thảo béo béo ngậy ngậy!'] },
      ],
    },
    {
      authorEmail: 'linhchi.pastry@gmail.com',
      content: `🍰 SWEET SUNDAY - BÁNH TART TRÁI CÂY & COCKTAIL DÂU TÂY MỘNG MƠ 🍓

Cuối tuần thưởng cho bản thân một góc nhỏ yên tĩnh, nhâm nhi miếng bánh Tart mâm xôi ngọt ngào và ly Cocktail dâu tây mát lạnh. Mọi mệt mỏi tuần qua tan biến hết! 💕🥂

#dessert #sweetsunday #cocktail #bakery #strawberry #chillvibes`,
      images: [
        'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=1200&q=80',
        'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=1200&q=80',
      ],
      comments: [
        { text: 'Hình chụp xinh xỉu xịn đét như tạp chí luôn Chi ơi!', replies: ['Cảm ơn nàng nhen! 💖'] },
        { text: 'Bánh tart dâu nhìn hấp dẫn quá trời nè!', replies: [] },
      ],
    },
    {
      authorEmail: 'xfoodiprojects@gmail.com',
      content: `🚀 CHÀO MỪNG BẠN ĐẾN VỚI MẠNG XÃ HỘI ẨM THỰC XFOODI SOCIAL!

XFoodi Social là nơi kết nối hàng triệu tâm hồn yêu ẩm thực, chủ nhà hàng và các thực khách thông thái trên toàn quốc:
✨ Chia sẻ bài viết, trải nghiệm ăn uống & công thức nấu ăn.
✨ Đặt bàn trực tiếp & đặt món giao tận nơi với ưu đãi độc quyền.
✨ Tích điểm đổi voucher quà tặng hấp dẫn mỗi ngày.

Hãy chia sẻ món ăn yêu thích của bạn ngay hôm nay cùng hashtag #XFoodi ! 🍽️🎉

#xfoodi #socialnetwork #amthuc #community #foodapp`,
      images: [
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80',
        'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1200&q=80',
      ],
      comments: [
        { text: 'Nền tảng quá xịn xò và mượt mà luôn! Chúc XFoodi phát triển rực rỡ! 🔥', replies: ['Cảm ơn bạn rất nhiều! Rất mong nhận được sự đồng hành của bạn!'] },
        { text: 'Giao diện mượt đẹp chuẩn công nghệ AI!', replies: [] },
      ],
    },
  ];

  // 3. Seed Hashtags & Posts
  const reactionTypes = ['like', 'love', 'haha', 'wow'];

  for (const item of postsData) {
    // Find author user
    const author = users.find((u) => u.email === item.authorEmail) || users[0];

    // Create SocialPost
    const post = await prisma.socialPost.create({
      data: {
        authorId: author.id,
        content: item.content,
        visibility: 'public',
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)), // Random within last 7 days
      },
    });

    console.log(`✅ Seeded Post ID ${post.id.slice(0, 8)} by ${author.fullName}`);

    // Create SocialImages
    for (const imgUrl of item.images) {
      await prisma.socialImage.create({
        data: {
          postId: post.id,
          imageUrl: imgUrl,
        },
      });
    }

    // Extract hashtags from content and link
    const hashtagMatches = item.content.match(/#[\wàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]+/gi);
    if (hashtagMatches) {
      for (const tagRaw of hashtagMatches) {
        const cleanTag = tagRaw.replace('#', '').toLowerCase();
        let hashtag = await prisma.socialHashtag.findUnique({ where: { tag: cleanTag } });
        if (!hashtag) {
          hashtag = await prisma.socialHashtag.create({
            data: { tag: cleanTag, postCount: 1 },
          });
        } else {
          await prisma.socialHashtag.update({
            where: { id: hashtag.id },
            data: { postCount: { increment: 1 } },
          });
        }

        await prisma.socialPostHashtag.create({
          data: {
            postId: post.id,
            hashtagId: hashtag.id,
          },
        }).catch(() => {}); // ignore duplicate joint
      }
    }

    // Create Reactions (Likes / Hearts) from random users
    const userPool = [...users];
    const reactionCount = Math.floor(Math.random() * users.length) + 2;
    for (let r = 0; r < Math.min(reactionCount, userPool.length); r++) {
      const u = userPool[r];
      const rType = reactionTypes[Math.floor(Math.random() * reactionTypes.length)];
      await prisma.socialReaction.create({
        data: {
          postId: post.id,
          userId: u.id,
          type: rType,
        },
      }).catch(() => {}); // ignore unique constraint
    }

    // Create Comments & Replies
    for (const cData of item.comments) {
      const commentator = users[Math.floor(Math.random() * users.length)];
      const mainComment = await prisma.socialComment.create({
        data: {
          postId: post.id,
          userId: commentator.id,
          content: cData.text,
        },
      });

      for (const replyText of cData.replies) {
        await prisma.socialComment.create({
          data: {
            postId: post.id,
            userId: author.id,
            parentId: mainComment.id,
            content: replyText,
          },
        });
      }
    }

    // Create Shares
    if (users.length > 1) {
      const sharer = users[(users.indexOf(author) + 1) % users.length];
      await prisma.socialShare.create({
        data: {
          postId: post.id,
          userId: sharer.id,
        },
      }).catch(() => {});
    }
  }

  // 4. Create Mutual Follows between users
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (i !== j && (i + j) % 2 === 0) {
        await prisma.socialFollow.create({
          data: {
            followerId: users[i].id,
            followingId: users[j].id,
          },
        }).catch(() => {});
      }
    }
  }

  console.log('🎉 Social Media Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding social media:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
