import { v2 as cloudinary } from 'cloudinary';
import { ENV } from '../config/env';

let configured = false;

export function isCloudinaryConfigured(): boolean {
  return !!(
    ENV.CLOUDINARY.CLOUD_NAME &&
    ENV.CLOUDINARY.API_KEY &&
    ENV.CLOUDINARY.API_SECRET
  );
}

export function getCloudinary() {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: ENV.CLOUDINARY.CLOUD_NAME,
      api_key: ENV.CLOUDINARY.API_KEY,
      api_secret: ENV.CLOUDINARY.API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}
