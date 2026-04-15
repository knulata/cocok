import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deletePublicProfile, ensureSchema } from '../lib/db';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (req.body ?? {}) as { id?: string; deleteToken?: string };
  const id = body.id?.trim();
  const token = body.deleteToken?.trim();
  if (!id || !token) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error('Schema bootstrap failed', err);
    res.status(500).json({ error: 'database_unavailable' });
    return;
  }

  const ok = await deletePublicProfile(id, token);
  if (!ok) {
    res.status(404).json({ error: 'not_found_or_bad_token' });
    return;
  }
  res.status(200).json({ ok: true });
}
