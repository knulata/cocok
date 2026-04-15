import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redisClient;
}

let findMatchesLimiter: Ratelimit | null = null;
export function getFindMatchesLimiter(): Ratelimit {
  if (!findMatchesLimiter) {
    findMatchesLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      analytics: false,
      prefix: 'cocok:rl:find-matches',
    });
  }
  return findMatchesLimiter;
}

let publishLimiter: Ratelimit | null = null;
export function getPublishLimiter(): Ratelimit {
  if (!publishLimiter) {
    publishLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      analytics: false,
      prefix: 'cocok:rl:publish',
    });
  }
  return publishLimiter;
}

export function getClientKey(headers: Record<string, string | string[] | undefined>): string {
  const xff = headers['x-forwarded-for'];
  const ip = Array.isArray(xff) ? xff[0] : xff?.split(',')[0].trim();
  return ip || 'anon';
}
