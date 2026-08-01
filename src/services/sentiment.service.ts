import { prisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { AIService } from './ai.service';
import { ENV } from '../config/env';

export interface SentimentReport {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  averageRating: number;
  themes: Array<{ theme: string; sentiment: 'positive' | 'negative' | 'neutral'; count: number }>;
  highlights: Array<{ quote: string; sentiment: 'positive' | 'negative' | 'neutral' }>;
}

/** Phân tích cảm xúc đánh giá của khách bằng Gemini (cache 1h, fallback theo rating). */
export async function getFeedbackSentiment(restaurantId: string): Promise<SentimentReport> {
  const cacheKey = `sentiment:${restaurantId}`;
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    /* redis down */
  }

  const feedbacks = await prisma.feedback.findMany({
    where: { order: { restaurantId }, comment: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { rating: true, comment: true },
  });

  const total = feedbacks.length;
  const averageRating = total > 0 ? Number((feedbacks.reduce((s, f) => s + f.rating, 0) / total).toFixed(1)) : 0;

  const fallback = (): SentimentReport => ({
    total,
    positive: feedbacks.filter((f) => f.rating >= 4).length,
    negative: feedbacks.filter((f) => f.rating <= 2).length,
    neutral: feedbacks.filter((f) => f.rating === 3).length,
    averageRating,
    themes: [],
    highlights: feedbacks.slice(0, 3).map((f) => ({
      quote: f.comment || '',
      sentiment: (f.rating >= 4 ? 'positive' : f.rating <= 2 ? 'negative' : 'neutral') as SentimentReport['highlights'][number]['sentiment'],
    })),
  });

  if (total === 0) return fallback();

  try {
    const comments = feedbacks.map((f, i) => `${i + 1}. (${f.rating}★) ${f.comment}`).join('\n');
    const prompt = `Phân tích cảm xúc các đánh giá nhà hàng dưới đây:
${comments}

Trả về JSON:
{"positive":<số bình luận tích cực>,"negative":<số tiêu cực>,"neutral":<số trung tính>,
"themes":[{"theme":"chủ đề ngắn tiếng Việt (vd: phục vụ, món ăn, giá cả)","sentiment":"positive|negative|neutral","count":<số lần nhắc>}],
"highlights":[{"quote":"trích 1 câu tiêu biểu","sentiment":"positive|negative|neutral"}]}
Tối đa 5 themes, 3 highlights.`;

    const response = await AIService.generateContent({
      model: ENV.AI.DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0.4 },
    });
    const text = (response as any)?.text;
    if (!text) return fallback();

    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    const result: SentimentReport = {
      total,
      positive: Number(parsed.positive) || 0,
      negative: Number(parsed.negative) || 0,
      neutral: Number(parsed.neutral) || 0,
      averageRating,
      themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 5) : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 3) : fallback().highlights,
    };
    try {
      await redisClient.set(cacheKey, JSON.stringify(result), { EX: 3600 });
    } catch {
      /* redis down */
    }
    return result;
  } catch (err: any) {
    console.warn('[Sentiment] AI failed, fallback:', err?.message);
    return fallback();
  }
}
