import { getCloudinary, isCloudinaryConfigured } from '../../../lib/cloudinary';
import { SocialServiceError } from '../middlewares/social.errors';

const MAX_IMAGES = 10;

export async function uploadSocialImages(
  files: { buffer: Buffer; mimetype: string; originalname?: string }[]
): Promise<{ urls: string[] }> {
  if (!isCloudinaryConfigured()) {
    throw new SocialServiceError(
      'Image upload is not configured. Set CLOUDINARY_* environment variables or pass imageUrls.',
      503
    );
  }

  if (!files.length) {
    throw new SocialServiceError('No images provided', 400);
  }
  if (files.length > MAX_IMAGES) {
    throw new SocialServiceError(`Maximum ${MAX_IMAGES} images allowed`, 400);
  }

  const cloudinary = getCloudinary();
  const urls: string[] = [];

  for (const file of files) {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'xfoodi/social',
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (err, res) => {
          if (err || !res) reject(err ?? new Error('Upload failed'));
          else resolve(res);
        }
      );
      stream.end(file.buffer);
    });
    urls.push(result.secure_url);
  }

  return { urls };
}
