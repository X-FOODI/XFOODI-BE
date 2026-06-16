const URL_REGEX = /^https?:\/\/.+/i;
const MAX_IMAGES_PER_POST = 10;

export function validateImageUrls(urls: unknown): { valid: boolean; errors: string[]; urls: string[] } {
  const errors: string[] = [];

  if (urls === undefined || urls === null) {
    return { valid: true, errors: [], urls: [] };
  }

  if (!Array.isArray(urls)) {
    return { valid: false, errors: ['imageUrls must be an array'], urls: [] };
  }

  if (urls.length > MAX_IMAGES_PER_POST) {
    errors.push(`A maximum of ${MAX_IMAGES_PER_POST} images is allowed per post`);
  }

  const normalized: string[] = [];
  for (const url of urls) {
    if (typeof url !== 'string' || !URL_REGEX.test(url.trim())) {
      errors.push('Each image must be a valid URL starting with http:// or https://');
      break;
    }
    normalized.push(url.trim());
  }

  return { valid: errors.length === 0, errors, urls: normalized };
}
