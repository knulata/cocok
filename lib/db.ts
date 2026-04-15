import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
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
      await sql`
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
      await sql`CREATE INDEX IF NOT EXISTS candidates_job_id_idx ON candidates(job_id)`;
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
};

export async function createJob(
  id: string,
  quizProfile: QuizProfile,
  filters: MatchFilters,
): Promise<void> {
  await sql`
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
    await sql`
      UPDATE match_jobs
      SET status = ${status}, error = ${error ?? null}, completed_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE match_jobs SET status = ${status} WHERE id = ${id}
    `;
  }
}

export async function saveCandidates(jobId: string, candidates: Candidate[]): Promise<void> {
  for (const c of candidates) {
    await sql`
      INSERT INTO candidates (
        job_id, rank, name, headline, url, source, summary,
        match_score, why_match, why_caution
      ) VALUES (
        ${jobId}, ${c.rank}, ${c.name}, ${c.headline}, ${c.url}, ${c.source},
        ${c.summary}, ${c.matchScore}, ${c.whyMatch}, ${c.whyCaution}
      )
    `;
  }
}

export async function getJob(id: string) {
  const rows = await sql`
    SELECT id, status, error, created_at, completed_at
    FROM match_jobs WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export async function getCandidates(jobId: string): Promise<Candidate[]> {
  const rows = await sql`
    SELECT rank, name, headline, url, source, summary,
           match_score AS "matchScore", why_match AS "whyMatch", why_caution AS "whyCaution"
    FROM candidates WHERE job_id = ${jobId}
    ORDER BY rank ASC
  `;
  return rows as Candidate[];
}
