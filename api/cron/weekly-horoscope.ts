import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ensureSchema,
  listWeeklyPingProfiles,
  markProfilesPinged,
} from '../../lib/db';
import { formatHoroscopeMessage, getWeeklyMessage } from '../../lib/horoscope';
import { sendText } from '../../lib/whatsapp';

const LOVE_TYPE_EMOJI: Record<string, string> = {
  'deep-connector': '💜',
  'passionate-explorer': '🔥',
  'steady-anchor': '🛡️',
  'free-spirit': '🌊',
  'growth-partner': '💎',
  'romantic-dreamer': '🎭',
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  if (secret) {
    if (!isVercelCron && auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  } else if (!isVercelCron) {
    // No secret configured and not called from Vercel's cron — refuse
    res.status(401).json({ error: 'unauthorized_no_secret' });
    return;
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error('Schema bootstrap failed in cron', err);
    res.status(500).json({ error: 'database_unavailable' });
    return;
  }

  const profiles = await listWeeklyPingProfiles();
  const sentIds: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const p of profiles) {
    const body = getWeeklyMessage(p.loveTypeKey);
    if (!body) continue;
    const emoji = LOVE_TYPE_EMOJI[p.loveTypeKey] ?? '💜';
    const message = formatHoroscopeMessage(p.name, p.loveType, emoji, body);
    try {
      await sendText(p.contact, message);
      sentIds.push(p.id);
    } catch (err) {
      errors.push({ id: p.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (sentIds.length > 0) {
    try {
      await markProfilesPinged(sentIds);
    } catch (err) {
      console.error('Failed to mark profiles pinged', err);
    }
  }

  res.status(200).json({
    ok: true,
    candidates: profiles.length,
    sent: sentIds.length,
    errors: errors.length,
  });
}
