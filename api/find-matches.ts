import { randomUUID } from 'node:crypto';
import {
  createJob,
  ensureSchema,
  saveCandidates,
  updateJobStatus,
  type MatchFilters,
  type QuizProfile,
} from '../lib/db.js';
import { findMatches } from '../lib/agent.js';

export const config = { maxDuration: 300 };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: { profile?: QuizProfile; filters?: MatchFilters };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const profile = body.profile;
  const filters = body.filters ?? {};
  if (!profile?.loveType) {
    return json({ error: 'missing_profile' }, 400);
  }

  await ensureSchema();
  const id = randomUUID();
  await createJob(id, profile, filters);

  try {
    await updateJobStatus(id, 'running');
    const candidates = await findMatches(profile, filters);
    await saveCandidates(id, candidates);
    await updateJobStatus(id, 'completed');
    return json({ id, status: 'completed', candidates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Agent failed for job', id, err);
    await updateJobStatus(id, 'failed', msg);
    return json({ id, status: 'failed', error: msg }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
