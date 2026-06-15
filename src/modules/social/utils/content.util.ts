const HASHTAG_REGEX = /#([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+)/g;
const MENTION_REGEX = /@([a-zA-Z0-9_.]+)/g;
const SCRIPT_TAG_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

import type { ParsedContentMeta } from '../interfaces/social.types';

/**
 * Strip dangerous script tags and normalize whitespace.
 */
export function sanitizeContent(content: string): string {
  return content.replace(SCRIPT_TAG_REGEX, '').trim();
}

export function parseContentMeta(content: string): ParsedContentMeta {
  const hashtags = new Set<string>();
  const mentions = new Set<string>();

  let match: RegExpExecArray | null;

  const hashtagRegex = new RegExp(HASHTAG_REGEX.source, HASHTAG_REGEX.flags);
  while ((match = hashtagRegex.exec(content)) !== null) {
    hashtags.add(match[1].toLowerCase());
  }

  const mentionRegex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.add(match[1]);
  }

  return {
    hashtags: Array.from(hashtags),
    mentions: Array.from(mentions),
  };
}

export function contentMatchesHashtag(content: string, hashtag: string): boolean {
  const normalized = hashtag.replace(/^#/, '').toLowerCase();
  const meta = parseContentMeta(content);
  return meta.hashtags.includes(normalized);
}
