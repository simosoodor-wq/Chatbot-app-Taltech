import { prisma } from "@/lib/prisma";
import { passageCount } from "@/lib/prompts";

export type Passage = {
  id: string;
  docId: string;
  manufacturer: string;
  title: string;
  url: string | null;
  page: number | null;
  content: string;
};

export type Source = Omit<Passage, "content" | "id" | "docId"> & { number: number };

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-4-large";
const VOYAGE_TIMEOUT_MS = 8_000;
const CANDIDATES = 40;
const RRF_K = 60;
const MAX_PER_DOCUMENT = 3;

const STOP_WORDS = new Set(
  "ja ning või kui et on ei ka see seda selle mis mida kes kus kuidas miks kas mina sina ta me te nad oma aga siis nii ole olla mitu palju kui millal vasta".split(
    " ",
  ),
);

async function embedQuery(query: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: [query], model: VOYAGE_MODEL, input_type: "query" }),
      signal: AbortSignal.timeout(VOYAGE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Voyage returned ${response.status}`);
    const body = await response.json();
    return body.data[0].embedding;
  } catch (error) {
    console.error("Query embedding failed, using text search only:", error);
    return null;
  }
}

function vectorSearch(embedding: number[]): Promise<Passage[]> {
  return prisma.$queryRaw<Passage[]>`
    SELECT "id", "docId", "manufacturer", "title", "url", "page", "content"
    FROM "DocumentChunk"
    WHERE "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${JSON.stringify(embedding)}::vector
    LIMIT ${CANDIDATES}`;
}

/** OR query: a question rarely repeats every word of a passage, but product codes must still hit. */
function searchTerms(query: string): string {
  const words = query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
  const useful = words.filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return [...new Set(useful)].join(" ");
}

function textSearch(query: string): Promise<Passage[]> {
  const terms = searchTerms(query);
  if (!terms) return Promise.resolve([]);
  return prisma.$queryRaw<Passage[]>`
    WITH q AS (
      SELECT to_tsquery('simple', string_agg(quote_literal(word), ' | ')) AS query
      FROM unnest(string_to_array(${terms}, ' ')) AS word
    )
    SELECT c."id", c."docId", c."manufacturer", c."title", c."url", c."page", c."content"
    FROM "DocumentChunk" c, q
    WHERE c."searchText" @@ q.query
    ORDER BY ts_rank_cd(c."searchText", q.query) DESC
    LIMIT ${CANDIDATES}`;
}

function mergeRankings(rankings: Passage[][], limit: number): Passage[] {
  const scores = new Map<string, { passage: Passage; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach((passage, index) => {
      const entry = scores.get(passage.id) ?? { passage, score: 0 };
      entry.score += 1 / (RRF_K + index + 1);
      scores.set(passage.id, entry);
    });
  }

  const perDocument = new Map<string, number>();
  const result: Passage[] = [];
  for (const { passage } of [...scores.values()].sort((a, b) => b.score - a.score)) {
    const count = perDocument.get(passage.docId) ?? 0;
    if (count >= MAX_PER_DOCUMENT) continue;
    perDocument.set(passage.docId, count + 1);
    result.push(passage);
    if (result.length === limit) break;
  }
  return result;
}

export async function retrievePassages(query: string, topP: number): Promise<Passage[]> {
  const embedding = await embedQuery(query);
  const [vector, text] = await Promise.all([
    embedding ? vectorSearch(embedding) : Promise.resolve([]),
    textSearch(query),
  ]);
  return mergeRankings([vector, text], passageCount(topP));
}

/** Keeps only sources the answer actually cites, numbered as they were given to the model. */
export function citedSources(passages: Passage[], answer: string): Source[] {
  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
  return passages.flatMap(({ title, manufacturer, url, page }, index) =>
    cited.has(index + 1) ? [{ number: index + 1, title, manufacturer, url, page }] : [],
  );
}
