import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deletePublicProfilesByContact, ensureSchema } from '../lib/db';
import { normalizePhone, sendText } from '../lib/whatsapp';

type FonnteBody = {
  sender?: string;
  message?: string;
  device?: string;
  pushName?: string;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (req.body ?? {}) as FonnteBody;
  const sender = extractPhone(body.sender);
  const message = (body.message ?? '').trim();

  if (!sender || !message) {
    res.status(200).json({ ok: true, ignored: 'missing_fields' });
    return;
  }

  const keyword = message.toUpperCase();
  const isDelete = keyword === 'HAPUS' || keyword === 'STOP' || keyword === 'DELETE';

  if (!isDelete) {
    res.status(200).json({ ok: true, ignored: 'unknown_keyword' });
    return;
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error('Schema bootstrap failed in webhook', err);
    res.status(200).json({ ok: true, error: 'database_unavailable' });
    return;
  }

  let removed = 0;
  try {
    removed = await deletePublicProfilesByContact(sender, 'wa');
  } catch (err) {
    console.error('Delete by contact failed', err);
  }

  const reply = removed > 0
    ? `✅ Profilmu sudah dihapus dari Cocok. Kamu tidak akan muncul lagi di pencarian.\n\nMau publikasi lagi nanti? Buka cocok.app dan kerjakan quiz-nya kembali.`
    : `Kami tidak menemukan profil aktif dengan nomor ini. Jika kamu ingin publikasi profil, buka cocok.app dulu.`;

  await sendText(sender, reply);

  res.status(200).json({ ok: true, removed });
}

function extractPhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/@.*$/, '').trim();
  return normalizePhone(stripped);
}
