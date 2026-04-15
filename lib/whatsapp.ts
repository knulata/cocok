import type { Candidate, QuizProfile } from './db';

const FONNTE_URL = 'https://api.fonnte.com/send';

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('8')) return '62' + digits;
  return digits;
}

export async function sendText(phone: string, message: string): Promise<void> {
  const apiKey = process.env.FONNTE_API_KEY;
  if (!apiKey) {
    console.warn('[whatsapp] FONNTE_API_KEY not set, skipping send to', phone);
    return;
  }
  const target = normalizePhone(phone);
  if (!target) {
    console.warn('[whatsapp] invalid phone', phone);
    return;
  }
  try {
    const res = await fetch(FONNTE_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target, message, countryCode: '62' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.status === false)) {
      console.error('[whatsapp] send failed', res.status, data);
    }
  } catch (err) {
    console.error('[whatsapp] send error', err);
  }
}

export function formatMatchesForSearcher(
  profile: QuizProfile,
  candidates: Candidate[],
  resultsUrl: string,
): string {
  const lines: string[] = [];
  lines.push(`💜 *Cocok — Hasil Pencarian Match-mu*`);
  lines.push('');
  lines.push(`Pola cintamu: *${profile.loveType}* ${profile.emoji}`);
  lines.push('');

  if (candidates.length === 0) {
    lines.push('Belum ada kandidat yang cocok dengan filter ini. Coba lagi dengan filter lain?');
    lines.push('');
    lines.push(resultsUrl);
    return lines.join('\n');
  }

  lines.push(`Ketemu *${candidates.length}* orang yang paling cocok:`);
  lines.push('');

  candidates.forEach((c, i) => {
    const rank = i + 1;
    const score = c.matchScore ?? 0;
    const verified = c.isVerified ? ' ✓ Verified' : '';
    lines.push(`*${rank}. ${c.name || 'Profil'}*${verified}`);
    lines.push(`Kecocokan: ${score}/100`);
    if (c.headline) lines.push(`_${c.headline}_`);
    if (c.summary) lines.push(c.summary);
    if (c.whyMatch) lines.push(`💚 ${c.whyMatch}`);
    if (c.whyCaution) lines.push(`⚠️ ${c.whyCaution}`);
    if (c.isVerified && c.contact) {
      if (c.contactType === 'ig') {
        lines.push(`📩 Instagram: @${String(c.contact).replace(/^@/, '')}`);
      } else {
        lines.push(`💬 WA: wa.me/${String(c.contact).replace(/[^0-9]/g, '')}`);
      }
    } else {
      lines.push(`🔗 ${c.url}`);
    }
    lines.push('');
  });

  lines.push('─────────');
  lines.push(`Lihat hasil lengkap: ${resultsUrl}`);
  lines.push('');
  lines.push('_Cocok.app — Cari yang Beneran Cocok_');
  return lines.join('\n');
}

export function formatNotificationForPoolProfile(
  poolProfileName: string,
  seeker: QuizProfile,
  rank: number,
): string {
  return [
    `💜 *Hai ${poolProfileName}!*`,
    '',
    `Seseorang baru saja pakai Cocok untuk cari pasangan, dan *kamu muncul di rank #${rank}* — cocok banget sama pola cintanya!`,
    '',
    `Pola cinta mereka: *${seeker.loveType}* ${seeker.emoji}`,
    seeker.description,
    '',
    `Kalau kamu tertarik ketemu orang-orang yang cocok sama kamu, update profilmu di cocok.app atau tunggu mereka chat duluan — kontakmu sudah mereka lihat.`,
    '',
    `Mau hapus profil kamu? Balas pesan ini dengan "HAPUS".`,
    '',
    `_Cocok.app — Cari yang Beneran Cocok_`,
  ].join('\n');
}
