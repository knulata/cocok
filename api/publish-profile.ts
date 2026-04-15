import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import {
  createPublicProfile,
  ensureSchema,
  type PublicProfileInput,
  type QuizProfile,
} from '../lib/db';

type Body = {
  loveType?: string;
  loveTypeKey?: string;
  name?: string;
  age?: number | string;
  city?: string;
  gender?: string;
  lookingForGender?: string;
  bio?: string;
  contact?: string;
  contactType?: string;
  quizProfile?: QuizProfile;
  consent?: boolean;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (req.body ?? {}) as Body;

  if (!body.consent) {
    res.status(400).json({ error: 'consent_required' });
    return;
  }

  const name = (body.name ?? '').trim();
  const city = (body.city ?? '').trim();
  const bio = (body.bio ?? '').trim();
  const contact = (body.contact ?? '').trim();
  const contactType = body.contactType === 'ig' ? 'ig' : 'wa';
  const gender = body.gender === 'male' || body.gender === 'female' || body.gender === 'other'
    ? body.gender
    : null;

  if (!name || name.length < 2 || name.length > 60) {
    res.status(400).json({ error: 'invalid_name' });
    return;
  }
  if (!city || city.length < 2 || city.length > 60) {
    res.status(400).json({ error: 'invalid_city' });
    return;
  }
  if (!bio || bio.length < 30 || bio.length > 600) {
    res.status(400).json({ error: 'invalid_bio', detail: 'Bio must be 30-600 characters' });
    return;
  }
  if (!contact || contact.length < 3 || contact.length > 60) {
    res.status(400).json({ error: 'invalid_contact' });
    return;
  }
  if (!gender) {
    res.status(400).json({ error: 'invalid_gender' });
    return;
  }
  if (!body.loveType || !body.loveTypeKey) {
    res.status(400).json({ error: 'missing_love_type' });
    return;
  }

  const ageRaw = typeof body.age === 'string' ? parseInt(body.age, 10) : body.age;
  const age = typeof ageRaw === 'number' && Number.isFinite(ageRaw) ? ageRaw : null;
  if (age !== null && (age < 18 || age > 80)) {
    res.status(400).json({ error: 'invalid_age' });
    return;
  }

  const lookingForGender = body.lookingForGender === 'male' || body.lookingForGender === 'female' || body.lookingForGender === 'any'
    ? body.lookingForGender
    : null;

  try {
    await ensureSchema();
  } catch (err) {
    console.error('Schema bootstrap failed', err);
    res.status(500).json({ error: 'database_unavailable' });
    return;
  }

  const id = 'cp_' + randomUUID().slice(0, 12);
  const deleteToken = randomUUID();

  const profile: PublicProfileInput = {
    id,
    loveType: body.loveType,
    loveTypeKey: body.loveTypeKey,
    name,
    age,
    city,
    gender,
    lookingForGender,
    bio,
    contact,
    contactType,
    quizProfile: body.quizProfile ?? null,
    deleteToken,
  };

  try {
    await createPublicProfile(profile);
  } catch (err) {
    console.error('Failed to create public profile', err);
    res.status(500).json({ error: 'insert_failed' });
    return;
  }

  res.status(200).json({ id, deleteToken });
}
