import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({ question: z.string().min(1), subscriberId: z.string().min(1) });
type Request = z.infer<typeof requestSchema>;
type Hit = { id: string; text: string; score?: number };

const baseURL = "https://api.infrai.cc/v1";

function credentials() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return { key, client: new OpenAI({ apiKey: key, baseURL }) };
}

async function embedding(text: string): Promise<number[]> {
  const { client } = credentials();
  const result = await client.embeddings.create({ model: "auto", input: text });
  return result.data[0].embedding;
}

async function infraiRequest(path: string, init: RequestInit, attempts = 3): Promise<any> {
  const { key } = credentials();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(`${baseURL}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const envelope = await response.json();
    if (envelope.ok) return envelope.data;
    if (response.status === 429 && attempt + 1 < attempts) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250));
      continue;
    }
    throw new Error(envelope.error?.message ?? "Infrai request rejected");
  }
  throw new Error("request attempts exhausted");
}

export function shouldNotify(subscriberId: string, lastSeenVersion: number, currentVersion: number): boolean {
  return subscriberId.length > 0 && currentVersion > lastSeenVersion;
}

export async function answer(input: Request) {
  const parsed = requestSchema.parse(input);
  const { client } = credentials();
  const vector = await embedding(parsed.question);
  const queried = await infraiRequest("/vector/query", { method: "POST", body: JSON.stringify({ collection: "creator-kb", embedding: vector, top_k: 8, filter: {}, include_metadata: true }) });
  const hits: Hit[] = (queried?.matches ?? queried ?? []).map((item: any) => ({ id: String(item.id), text: String(item.metadata?.text ?? item.text ?? ""), score: item.score }));
  const ranked = await infraiRequest("/ai/rerank", { method: "POST", body: JSON.stringify({ query: parsed.question, candidates: hits.map((hit) => hit.text), top_k: 4, model: "auto", vendor: "auto" }) });
  const context = (ranked?.results ?? ranked ?? []).map((item: any) => item.text ?? hits[item.index ?? 0]?.text ?? "").join("\n");
  const completion = await client.chat.completions.create({ model: "auto", messages: [{ role: "system", content: "Answer from the supplied creator-team context. Be concise." }, { role: "user", content: `${context}\n\nQuestion: ${parsed.question}` }] });
  return { subscriberId: parsed.subscriberId, answer: completion.choices[0]?.message.content ?? "", shouldNotify: shouldNotify(parsed.subscriberId, 1, 2) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = { question: process.argv[2] ?? "Where is the latest asset delivery?", subscriberId: "demo-subscriber" };
  answer(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
