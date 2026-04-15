import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema, getCandidates, getJob } from '../../lib/db';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const id = typeof req.query.id === 'string' ? req.query.id : undefined;
  if (!id) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error('Schema bootstrap failed', err);
    res.status(500).json({ error: 'database_unavailable' });
    return;
  }

  const job = await getJob(id);
  if (!job) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const candidates = job.status === 'completed' ? await getCandidates(id) : [];
  res.status(200).json({ id, status: job.status, error: job.error, candidates });
}
