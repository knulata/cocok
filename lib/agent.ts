import Exa from 'exa-js';
import OpenAI from 'openai';
import {
  listPublicProfiles,
  type Candidate,
  type MatchFilters,
  type PublicProfile,
  type QuizProfile,
} from './db';

let exaClient: Exa | null = null;
let openaiClient: OpenAI | null = null;
function getExa(): Exa {
  if (!exaClient) exaClient = new Exa(process.env.EXA_API_KEY!);
  return exaClient;
}
function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openaiClient;
}

type RawCandidate = {
  // discriminator
  origin: 'web' | 'pool';
  // shared
  title: string;
  url: string;
  author: string | null;
  text: string;
  source: string;
  // pool-only
  poolProfile?: PublicProfile;
};

export async function findMatches(
  profile: QuizProfile,
  filters: MatchFilters,
): Promise<Candidate[]> {
  const [pool, queries] = await Promise.all([
    fetchPoolCandidates(filters),
    buildQueries(profile, filters),
  ]);
  const web = await searchAll(queries);
  const merged = dedupeByUrl([...pool, ...web]);
  const scored = await scoreCandidates(profile, filters, merged);

  scored.sort((a, b) => {
    const av = a.isVerified ? 1 : 0;
    const bv = b.isVerified ? 1 : 0;
    if (av !== bv) return bv - av;
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });

  return scored.slice(0, 5).map((c, i) => ({ ...c, rank: i + 1 }));
}

async function fetchPoolCandidates(filters: MatchFilters): Promise<RawCandidate[]> {
  try {
    const profiles = await listPublicProfiles({
      city: filters.city,
      ageMin: filters.ageMin,
      ageMax: filters.ageMax,
      wantGender: filters.lookingForGender,
      seekerGender: filters.seekerGender,
      limit: 30,
    });
    return profiles.map((p) => ({
      origin: 'pool',
      title: `${p.name}${p.age ? `, ${p.age}` : ''} — ${p.city}`,
      url: `cocok://profile/${p.id}`,
      author: p.name,
      text: `${p.loveType}. ${p.bio}`,
      source: 'cocok-pool',
      poolProfile: p,
    }));
  } catch (err) {
    console.error('Failed to load pool profiles', err);
    return [];
  }
}

async function buildQueries(
  profile: QuizProfile,
  filters: MatchFilters,
): Promise<string[]> {
  const prompt = `You are a matchmaker. A user just took a love-pattern quiz.
Their result: ${profile.loveType} — ${profile.description}
Filters: ${JSON.stringify(filters)}

Generate 5 diverse natural-language web search queries to find REAL public profiles
of people in ${filters.city ?? 'Indonesia'} who would match this person romantically.
Strongly prefer LinkedIn public profiles and personal blogs. Focus on finding people
who express themselves publicly — writers, creators, professionals, indie hackers.
Each query should describe a PERSON (not a job posting, not a company).
Return JSON: {"queries": ["...", ...]}.`;

  const res = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const parsed = JSON.parse(res.choices[0].message.content ?? '{"queries":[]}');
  const base: string[] = (parsed.queries ?? []).slice(0, 4);
  const city = filters.city ?? 'Indonesia';
  const linkedinQuery = `site:linkedin.com/in ${city} ${profile.loveType.toLowerCase()}`;
  return [...base, linkedinQuery];
}

async function searchAll(queries: string[]): Promise<RawCandidate[]> {
  const results: RawCandidate[] = [];
  await Promise.all(
    queries.map(async (q) => {
      try {
        const r = await getExa().searchAndContents(q, {
          numResults: 6,
          type: 'neural',
          text: { maxCharacters: 2000 },
          livecrawl: 'fallback',
        });
        for (const item of r.results) {
          results.push({
            origin: 'web',
            title: item.title ?? 'Untitled',
            url: item.url,
            author: (item as { author?: string }).author ?? null,
            text: item.text ?? '',
            source: domainOf(item.url),
          });
        }
      } catch (err) {
        console.error('Exa search failed for query:', q, err);
      }
    }),
  );
  return results;
}

function dedupeByUrl(results: RawCandidate[]): RawCandidate[] {
  const seen = new Set<string>();
  const out: RawCandidate[] = [];
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function nameAppearsInSource(name: string | null | undefined, text: string, title: string): boolean {
  if (!name) return false;
  const needle = name.toLowerCase().trim();
  if (needle.length < 3) return false;
  const haystack = (text + ' ' + title).toLowerCase();
  if (haystack.includes(needle)) return true;
  const first = needle.split(/\s+/)[0];
  return first.length >= 3 && haystack.includes(first);
}

function containsCoupledSignal(text: string): boolean {
  const t = text.toLowerCase();
  const redFlags = [
    ' husband', ' wife', ' suami', ' istri', ' my boyfriend', ' my girlfriend',
    ' fiancé', ' fiancee', ' engaged to', ' pacar saya', ' married to',
    ' anak saya', ' our kids', ' our baby',
  ];
  return redFlags.some((f) => t.includes(f));
}

async function scoreCandidates(
  profile: QuizProfile,
  filters: MatchFilters,
  results: RawCandidate[],
): Promise<Candidate[]> {
  if (results.length === 0) return [];

  const limited = results.slice(0, 25);

  const prompt = `You are a matchmaker scoring candidates for compatibility for an Indonesian dating quiz service.

SEEKER:
- Love pattern: ${profile.loveType} ${profile.emoji}
- ${profile.description}
- Filters: ${JSON.stringify(filters)}

CANDIDATES (mix of opted-in Cocok members and public web):
${limited
  .map(
    (r, i) => `[${i}] ORIGIN=${r.origin} — ${r.title}
URL: ${r.url}
Source: ${r.source}
Author: ${r.author ?? 'unknown'}
Content: ${(r.text ?? '').slice(0, 600)}`,
  )
  .join('\n\n')}

Rules:
- Skip results clearly not about a real individual (companies, job posts, articles about someone else).
- Skip anyone whose text indicates they are already married, engaged, or in a committed relationship.
- ORIGIN=pool candidates are opted-in Cocok members — boost their scores by +10 and mark verified=true.
- For each kept candidate, explain whyMatch and whyCaution honestly and in Indonesian.
- The "name" you return MUST appear in the candidate's content or title. If you can't confirm the name, return null.

Return the top 10 as JSON:
{"candidates":[{"index":0,"name":"...","headline":"...","summary":"...","matchScore":85,"whyMatch":"...","whyCaution":"..."}]}`;

  const res = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const parsed = JSON.parse(res.choices[0].message.content ?? '{"candidates":[]}');
  const scored: Candidate[] = [];
  for (const c of parsed.candidates ?? []) {
    const src = limited[c.index];
    if (!src) continue;

    if (src.origin === 'web') {
      if (containsCoupledSignal(src.text)) continue;
      if (!nameAppearsInSource(c.name, src.text, src.title)) {
        c.name = src.author ?? null;
      }
    }

    const baseScore = typeof c.matchScore === 'number' ? c.matchScore : null;

    if (src.origin === 'pool' && src.poolProfile) {
      scored.push({
        rank: 0,
        name: src.poolProfile.name,
        headline: src.poolProfile.loveType,
        url: src.url,
        source: 'cocok-pool',
        summary: c.summary ?? src.poolProfile.bio,
        matchScore: baseScore !== null ? Math.min(100, baseScore + 10) : 85,
        whyMatch: c.whyMatch ?? null,
        whyCaution: c.whyCaution ?? null,
        contact: src.poolProfile.contact,
        contactType: src.poolProfile.contactType,
        isVerified: true,
      });
    } else {
      scored.push({
        rank: 0,
        name: c.name ?? null,
        headline: c.headline ?? null,
        url: src.url,
        source: src.source,
        summary: c.summary ?? null,
        matchScore: baseScore,
        whyMatch: c.whyMatch ?? null,
        whyCaution: c.whyCaution ?? null,
        contact: null,
        contactType: null,
        isVerified: false,
      });
    }
  }
  return scored;
}
