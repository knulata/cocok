import Exa from 'exa-js';
import OpenAI from 'openai';
import type { Candidate, MatchFilters, QuizProfile } from './db.js';

const exa = new Exa(process.env.EXA_API_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type RawResult = {
  title: string | null;
  url: string;
  author: string | null;
  text: string | null;
  source: string;
};

export async function findMatches(
  profile: QuizProfile,
  filters: MatchFilters,
): Promise<Candidate[]> {
  const queries = await buildQueries(profile, filters);
  const raw = await searchAll(queries);
  const deduped = dedupeByUrl(raw);
  const scored = await scoreCandidates(profile, filters, deduped);
  return scored.slice(0, 5).map((c, i) => ({ ...c, rank: i + 1 }));
}

async function buildQueries(
  profile: QuizProfile,
  filters: MatchFilters,
): Promise<string[]> {
  const prompt = `You are a matchmaker. A user just took a love-pattern quiz.
Their result: ${profile.loveType} — ${profile.description}
Filters: ${JSON.stringify(filters)}

Generate 5 diverse natural-language web search queries to find REAL public profiles
(LinkedIn, personal blogs, Twitter/X, Bluesky, Medium, Dev.to, etc.) of people in
${filters.city ?? 'Indonesia'} who would match this person romantically.
Focus on finding people who express themselves publicly — writers, creators, professionals.
Each query should describe a PERSON, not a job posting. Return JSON: {"queries": ["...", ...]}.`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const parsed = JSON.parse(res.choices[0].message.content ?? '{"queries":[]}');
  return (parsed.queries ?? []).slice(0, 5);
}

async function searchAll(queries: string[]): Promise<RawResult[]> {
  const results: RawResult[] = [];
  await Promise.all(
    queries.map(async (q) => {
      try {
        const r = await exa.searchAndContents(q, {
          numResults: 6,
          type: 'neural',
          text: { maxCharacters: 2000 },
          livecrawl: 'fallback',
        });
        for (const item of r.results) {
          results.push({
            title: item.title ?? null,
            url: item.url,
            author: (item as { author?: string }).author ?? null,
            text: item.text ?? null,
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

function dedupeByUrl(results: RawResult[]): RawResult[] {
  const seen = new Set<string>();
  const out: RawResult[] = [];
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

async function scoreCandidates(
  profile: QuizProfile,
  filters: MatchFilters,
  results: RawResult[],
): Promise<Candidate[]> {
  if (results.length === 0) return [];

  const prompt = `You are a matchmaker scoring candidates for compatibility.

SEEKER:
- Love pattern: ${profile.loveType} ${profile.emoji}
- ${profile.description}
- Filters: ${JSON.stringify(filters)}

CANDIDATES (public web results):
${results
  .slice(0, 20)
  .map(
    (r, i) => `[${i}] ${r.title ?? 'Untitled'} — ${r.url}
Source: ${r.source}
Author: ${r.author ?? 'unknown'}
Content: ${(r.text ?? '').slice(0, 600)}`,
  )
  .join('\n\n')}

Score each candidate 0-100 for romantic compatibility based on what they write/share.
Skip results that are clearly not about a real person (companies, job posts, articles about
someone else). For each kept candidate, explain matchReason and cautionReason honestly.
Return the top 10 as JSON: {"candidates":[{"index":0,"name":"...","headline":"...","summary":"...","matchScore":85,"whyMatch":"...","whyCaution":"..."}]}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const parsed = JSON.parse(res.choices[0].message.content ?? '{"candidates":[]}');
  const scored: Candidate[] = [];
  for (const c of parsed.candidates ?? []) {
    const src = results[c.index];
    if (!src) continue;
    scored.push({
      rank: 0,
      name: c.name ?? null,
      headline: c.headline ?? null,
      url: src.url,
      source: src.source,
      summary: c.summary ?? null,
      matchScore: typeof c.matchScore === 'number' ? c.matchScore : null,
      whyMatch: c.whyMatch ?? null,
      whyCaution: c.whyCaution ?? null,
    });
  }
  scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  return scored;
}
