import { ensureSchema, getCandidates, getJob } from '../../lib/db.js';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.pathname.split('/').pop();
  if (!id) return json({ error: 'missing_id' }, 400);

  await ensureSchema();
  const job = await getJob(id);
  if (!job) return json({ error: 'not_found' }, 404);

  const candidates = job.status === 'completed' ? await getCandidates(id) : [];
  return json({ id, status: job.status, error: job.error, candidates });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
