import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { unknownWords, wordEvents } from "@/db/schema";
import { memoryTransition, normalizeWord, type WordAction } from "@/lib/word-memory";

const OWNER_KEY = "site-owner";

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const uid = OWNER_KEY;
  const rows = await getDb()
    .select()
    .from(unknownWords)
    .where(eq(unknownWords.userId, uid))
    .orderBy(desc(unknownWords.lastClickedAt));
  const word = new URL(request.url).searchParams.get("word");
  const history = word ? await getDb().select().from(wordEvents).where(and(eq(wordEvents.userId, uid), eq(wordEvents.normalized, normalizeWord(word)))).orderBy(desc(wordEvents.createdAt)).limit(100) : undefined;
  return Response.json({
    history,
    words: rows.map((row) => ({ ...row, contexts: parseList(row.contexts), documentIds: parseList(row.documentIds) })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const uid = OWNER_KEY;
  const input = (await request.json()) as {
    action?: WordAction;
    word?: string;
    context?: string;
    documentId?: string;
  };
  const display = String(input.word || "").slice(0, 80);
  const normalized = normalizeWord(display);
  if (!normalized) return Response.json({ error: "无效单词。" }, { status: 400 });
  const action = input.action ?? "mark";
  if (!["mark", "unmark", "learned", "remembered", "forgot"].includes(action)) return Response.json({ error: "无效记忆操作。" }, { status: 400 });
  const db = getDb();
  const current = await db
    .select()
    .from(unknownWords)
    .where(and(eq(unknownWords.userId, uid), eq(unknownWords.normalized, normalized)))
    .limit(1);
  const now = Date.now();
  const previous = current[0] ?? { stage: -1, lastAdvancedAt: 0, recallCount: 0, forgetCount: 0 };
  const memory = memoryTransition(previous, action, now);
  const contexts = current[0] ? parseList(current[0].contexts) : [];
  const documentIds = current[0] ? parseList(current[0].documentIds) : [];
  const context = String(input.context || "").trim().slice(0, 500);
  const documentId = String(input.documentId || "").trim().slice(0, 100);
  if (context && !contexts.includes(context)) contexts.unshift(context);
  if (documentId && !documentIds.includes(documentId)) documentIds.unshift(documentId);
  const values = {
    display, stage: memory.stage, lastAdvancedAt: memory.lastAdvancedAt,
    recallCount: memory.recallCount, forgetCount: memory.forgetCount,
    clickCount: (current[0]?.clickCount ?? 0) + (action === "mark" ? 1 : 0),
    contexts: JSON.stringify(contexts.slice(0, 8)), documentIds: JSON.stringify(documentIds.slice(0, 20)), lastClickedAt: now,
  };
  await db.batch([db
    .insert(unknownWords)
    .values({
      userId: uid,
      normalized,
      firstClickedAt: now,
      ...values,
    })
    .onConflictDoUpdate({
      target: [unknownWords.userId, unknownWords.normalized],
      set: values,
    }), db.insert(wordEvents).values({id: crypto.randomUUID(), userId: uid, normalized, action, fromStage: previous.stage, toStage: memory.stage, context, documentId, createdAt: now})]);
  return Response.json({ word: { normalized, ...values, contexts: contexts.slice(0, 8), documentIds: documentIds.slice(0, 20) }, advanced: memory.stage > previous.stage });
}
