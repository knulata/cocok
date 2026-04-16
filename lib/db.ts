import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let sqlClient: NeonQueryFunction<false, false> | null = null;
function sql(): NeonQueryFunction<false, false> {
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL!);
  return sqlClient;
}

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql()`
        CREATE TABLE IF NOT EXISTS match_jobs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'pending',
          quiz_profile JSONB NOT NULL,
          filters JSONB NOT NULL,
          error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `;
      await sql()`
        CREATE TABLE IF NOT EXISTS candidates (
          id BIGSERIAL PRIMARY KEY,
          job_id TEXT NOT NULL REFERENCES match_jobs(id) ON DELETE CASCADE,
          rank INT NOT NULL,
          name TEXT,
          headline TEXT,
          url TEXT NOT NULL,
          source TEXT NOT NULL,
          summary TEXT,
          match_score INT,
          why_match TEXT,
          why_caution TEXT,
          raw JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql()`CREATE INDEX IF NOT EXISTS candidates_job_id_idx ON candidates(job_id)`;
      await sql()`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS contact TEXT`;
      await sql()`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS contact_type TEXT`;
      await sql()`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql()`
        CREATE TABLE IF NOT EXISTS public_profiles (
          id TEXT PRIMARY KEY,
          love_type TEXT NOT NULL,
          love_type_key TEXT NOT NULL,
          name TEXT NOT NULL,
          age INT,
          city TEXT NOT NULL,
          gender TEXT NOT NULL,
          looking_for_gender TEXT,
          bio TEXT NOT NULL,
          contact TEXT NOT NULL,
          contact_type TEXT NOT NULL,
          quiz_profile JSONB,
          consent_given_at TIMESTAMPTZ NOT NULL,
          is_visible BOOLEAN NOT NULL DEFAULT TRUE,
          delete_token TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql()`CREATE INDEX IF NOT EXISTS public_profiles_city_idx ON public_profiles(city)`;
      await sql()`CREATE INDEX IF NOT EXISTS public_profiles_love_type_idx ON public_profiles(love_type_key)`;
      await sql()`CREATE INDEX IF NOT EXISTS public_profiles_visible_idx ON public_profiles(is_visible)`;
      await sql()`ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS wants_weekly_pings BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql()`ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS last_pinged_at TIMESTAMPTZ`;
      await sql()`CREATE INDEX IF NOT EXISTS public_profiles_weekly_idx ON public_profiles(wants_weekly_pings, is_visible)`;
    })();
  }
  return schemaReady;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type QuizProfile = {
  loveType: string;
  emoji: string;
  description: string;
  answers: Record<string, string>;
};

export type MatchFilters = {
  city?: string;
  ageMin?: number;
  ageMax?: number;
  lookingFor?: string;
  interests?: string[];
  notes?: string;
  seekerGender?: 'male' | 'female' | 'other';
  lookingForGender?: 'male' | 'female' | 'any';
};

export type Candidate = {
  rank: number;
  name: string | null;
  headline: string | null;
  url: string;
  source: string;
  summary: string | null;
  matchScore: number | null;
  whyMatch: string | null;
  whyCaution: string | null;
  contact?: string | null;
  contactType?: string | null;
  isVerified?: boolean;
};

export async function createJob(
  id: string,
  quizProfile: QuizProfile,
  filters: MatchFilters,
): Promise<void> {
  await sql()`
    INSERT INTO match_jobs (id, status, quiz_profile, filters)
    VALUES (${id}, 'pending', ${JSON.stringify(quizProfile)}, ${JSON.stringify(filters)})
  `;
}

export async function updateJobStatus(
  id: string,
  status: JobStatus,
  error?: string,
): Promise<void> {
  if (status === 'completed' || status === 'failed') {
    await sql()`
      UPDATE match_jobs
      SET status = ${status}, error = ${error ?? null}, completed_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql()`
      UPDATE match_jobs SET status = ${status} WHERE id = ${id}
    `;
  }
}

export async function saveCandidates(jobId: string, candidates: Candidate[]): Promise<void> {
  for (const c of candidates) {
    await sql()`
      INSERT INTO candidates (
        job_id, rank, name, headline, url, source, summary,
        match_score, why_match, why_caution, contact, contact_type, is_verified
      ) VALUES (
        ${jobId}, ${c.rank}, ${c.name}, ${c.headline}, ${c.url}, ${c.source},
        ${c.summary}, ${c.matchScore}, ${c.whyMatch}, ${c.whyCaution},
        ${c.contact ?? null}, ${c.contactType ?? null}, ${c.isVerified ?? false}
      )
    `;
  }
}

export async function getJob(id: string) {
  const rows = await sql()`
    SELECT id, status, error, created_at, completed_at
    FROM match_jobs WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export async function getCandidates(jobId: string): Promise<Candidate[]> {
  const rows = await sql()`
    SELECT rank, name, headline, url, source, summary,
           match_score AS "matchScore", why_match AS "whyMatch", why_caution AS "whyCaution",
           contact, contact_type AS "contactType", is_verified AS "isVerified"
    FROM candidates WHERE job_id = ${jobId}
    ORDER BY rank ASC
  `;
  return rows as Candidate[];
}

export type PublicProfile = {
  id: string;
  loveType: string;
  loveTypeKey: string;
  name: string;
  age: number | null;
  city: string;
  gender: string;
  lookingForGender: string | null;
  bio: string;
  contact: string;
  contactType: string;
};

export type PublicProfileInput = {
  id: string;
  loveType: string;
  loveTypeKey: string;
  name: string;
  age: number | null;
  city: string;
  gender: string;
  lookingForGender: string | null;
  bio: string;
  contact: string;
  contactType: string;
  quizProfile: QuizProfile | null;
  deleteToken: string;
  wantsWeeklyPings: boolean;
};

export async function createPublicProfile(p: PublicProfileInput): Promise<void> {
  await sql()`
    INSERT INTO public_profiles (
      id, love_type, love_type_key, name, age, city, gender,
      looking_for_gender, bio, contact, contact_type, quiz_profile,
      consent_given_at, is_visible, delete_token, wants_weekly_pings
    ) VALUES (
      ${p.id}, ${p.loveType}, ${p.loveTypeKey}, ${p.name}, ${p.age},
      ${p.city}, ${p.gender}, ${p.lookingForGender}, ${p.bio}, ${p.contact},
      ${p.contactType}, ${p.quizProfile ? JSON.stringify(p.quizProfile) : null},
      NOW(), TRUE, ${p.deleteToken}, ${p.wantsWeeklyPings}
    )
  `;
}

export async function markProfilesPinged(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql()`UPDATE public_profiles SET last_pinged_at = NOW() WHERE id = ANY(${ids}::text[])`;
}

export async function listPublicProfiles(opts: {
  city?: string;
  ageMin?: number;
  ageMax?: number;
  wantGender?: 'male' | 'female' | 'any';
  seekerGender?: 'male' | 'female' | 'other';
  limit?: number;
}): Promise<PublicProfile[]> {
  const limit = opts.limit ?? 50;
  const cityLike = opts.city ? `%${opts.city.toLowerCase()}%` : null;
  const wantGender = opts.wantGender && opts.wantGender !== 'any' ? opts.wantGender : null;
  const seekerGender = opts.seekerGender ?? null;
  const rows = await sql()`
    SELECT id, love_type AS "loveType", love_type_key AS "loveTypeKey",
           name, age, city, gender, looking_for_gender AS "lookingForGender",
           bio, contact, contact_type AS "contactType"
    FROM public_profiles
    WHERE is_visible = TRUE
      AND (${cityLike}::text IS NULL OR LOWER(city) LIKE ${cityLike}::text)
      AND (${opts.ageMin ?? null}::int IS NULL OR age IS NULL OR age >= ${opts.ageMin ?? null}::int)
      AND (${opts.ageMax ?? null}::int IS NULL OR age IS NULL OR age <= ${opts.ageMax ?? null}::int)
      AND (${wantGender}::text IS NULL OR gender = ${wantGender}::text)
      AND (
        ${seekerGender}::text IS NULL
        OR looking_for_gender IS NULL
        OR looking_for_gender = 'any'
        OR looking_for_gender = ${seekerGender}::text
      )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as PublicProfile[];
}

export async function deletePublicProfilesByContact(
  contact: string,
  contactType: string,
): Promise<number> {
  const rows = await sql()`
    UPDATE public_profiles
    SET is_visible = FALSE
    WHERE contact = ${contact}
      AND contact_type = ${contactType}
      AND is_visible = TRUE
    RETURNING id
  `;
  return rows.length;
}

export async function listWeeklyPingProfiles(): Promise<PublicProfile[]> {
  const rows = await sql()`
    SELECT id, love_type AS "loveType", love_type_key AS "loveTypeKey",
           name, age, city, gender, looking_for_gender AS "lookingForGender",
           bio, contact, contact_type AS "contactType"
    FROM public_profiles
    WHERE is_visible = TRUE
      AND wants_weekly_pings = TRUE
      AND contact_type = 'wa'
    ORDER BY created_at DESC
  `;
  return rows as PublicProfile[];
}

export async function deletePublicProfile(id: string, token: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE public_profiles
    SET is_visible = FALSE
    WHERE id = ${id} AND delete_token = ${token}
    RETURNING id
  `;
  return rows.length > 0;
}
