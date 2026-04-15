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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = req.body as { profile?: QuizProfile; filters?: MatchFilters } | undefined;
  const profile = body?.profile;
  const filters = body?.filters ?? {};
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
    res.status(200).json({ id, status: 'completed', candidates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Agent failed for job', id, err);
    await updateJobStatus(id, 'failed', msg);
    res.status(500).json({ id, status: 'failed', error: msg });
  }
}
