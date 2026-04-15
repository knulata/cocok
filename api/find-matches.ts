import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import {
  createJob,
  ensureSchema,
  saveCandidates,
  updateJobStatus,
  type MatchFilters,
  type QuizProfile,
} from '../lib/db';
import { findMatches } from '../lib/agent';
import {
  formatMatchesForSearcher,
  formatNotificationForPoolProfile,
  sendText,
} from '../lib/whatsapp';
import { getClientKey, getFindMatchesLimiter } from '../lib/ratelimit';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const key = getClientKey(req.headers);
    const rl = await getFindMatchesLimiter().limit(key);
    res.setHeader('X-RateLimit-Limit', rl.limit);
    res.setHeader('X-RateLimit-Remaining', rl.remaining);
    if (!rl.success) {
      res.status(429).json({
        error: 'rate_limited',
        message: 'Terlalu banyak permintaan. Coba lagi dalam 1 jam.',
      });
      return;
    }
  } catch (err) {
    console.error('[ratelimit] find-matches failed', err);
  }

  const body = req.body as {
    profile?: QuizProfile;
    filters?: MatchFilters;
    searcherWhatsapp?: string;
  } | undefined;
  const profile = body?.profile;
  const filters = body?.filters ?? {};
  const searcherWhatsapp = (body?.searcherWhatsapp ?? '').trim() || null;
  if (!profile?.loveType) {
    res.status(400).json({ error: 'missing_profile' });
    return;
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error('Schema bootstrap failed', err);
    res.status(500).json({ error: 'database_unavailable' });
    return;
  }

  const id = randomUUID();
  await createJob(id, profile, filters);

  try {
    await updateJobStatus(id, 'running');
    const candidates = await findMatches(profile, filters);
    await saveCandidates(id, candidates);
    await updateJobStatus(id, 'completed');

    const host = req.headers.host ?? 'www.cocok.app';
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const resultsUrl = `${proto}://${host}/results?id=${encodeURIComponent(id)}`;

    const sends: Promise<void>[] = [];
    if (searcherWhatsapp) {
      sends.push(
        sendText(searcherWhatsapp, formatMatchesForSearcher(profile, candidates, resultsUrl)),
      );
    }
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.isVerified && c.contactType === 'wa' && c.contact) {
        sends.push(
          sendText(c.contact, formatNotificationForPoolProfile(c.name ?? 'Kamu', profile, i + 1)),
        );
      }
    }
    await Promise.allSettled(sends);

    res.status(200).json({ id, status: 'completed', candidates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Agent failed for job', id, err);
    await updateJobStatus(id, 'failed', msg);
    res.status(500).json({ id, status: 'failed', error: msg });
  }
}
