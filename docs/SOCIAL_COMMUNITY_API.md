# Social Community API (Extension)

Legacy routes under `/api/social/*` remain unchanged for backward compatibility.

## New feeds

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/social/feed/latest` | optional |
| GET | `/api/social/feed/trending` | optional |
| GET | `/api/social/feed/following` | required (Bearer) |
| GET | `/api/social/feed/profile?userId=` | optional |

Query: `limit`, `cursor`, `authorId` (profile)

## Hashtags

| GET | `/api/social/hashtags/trending` |
| GET | `/api/social/hashtags/:tag/posts` |

## Follows

| POST | `/api/social/follows/:userId` |
| DELETE | `/api/social/follows/:userId` |
| GET | `/api/social/follows/:userId/stats` |

## Notifications

| GET | `/api/social/notifications` |
| PATCH | `/api/social/notifications/read` body `{ ids?: string[] }` |
| GET | `/api/social/notifications/unread-count` |

## Search

`GET /api/social/search?q=foo&type=all|users|posts|hashtags`

## Enhanced posts (visibility, repost, hashtag index)

| POST | `/api/social/v2/posts` body `{ content, imageUrls?, visibility?, repostOfId? }` |
| PATCH | `/api/social/v2/posts/:id` |

`visibility`: `public` | `followers` | `private`

## Enhanced reactions/comments (with notifications)

| POST | `/api/social/v2/reactions` |
| POST | `/api/social/v2/comments` |

## Media (Cloudinary)

`POST /api/social/media/upload`  
Body: `{ "files": [{ "base64": "...", "mimeType": "image/jpeg" }] }`

Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

## Profile

| GET | `/api/social/profile/:userId` |
| PATCH | `/api/social/profile/me` body `{ bio?, coverImageUrl?, avatarUrl?, fullName? }` |

## Database

Run: `npx prisma migrate deploy`

Migration: `20260527120000_social_community_upgrade`

Legacy tables kept: `SocialImages` (= SocialPostImage), `SavedPosts` (= SocialBookmark).
