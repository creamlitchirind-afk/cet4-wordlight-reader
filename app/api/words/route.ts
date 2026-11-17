import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { unknownWords } from "@/db/schema";

const OWNER_KEY = "site-owner";

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

export async function GET(request: Request) {
  void request;
  const uid = OWNER_KEY;
  const rows = await getDb()
    .select()
    .from(unknownWords)
    .where(eq(unknownWords.userId, uid))
    .orderBy(desc(unknownWords.lastClickedAt));
  return Response.json({
    words: rows.map((row) => ({ ...row, contexts: parseList(row.contexts), documentIds: parseList(row.documentIds) })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const uid = OWNER_KEY;
  const input = (await request.json()) as {
    action?: "mark" | "unmark";
    word?: string;
    context?: string;
    documentId?: string;
  };
  const display = String(input.word || "").slice(0, 80);
  const normalized = normalize(display);
  if (!normalized) return Response.json({ error: "无效单词。" }, { status: 400 });
  const db = getDb();
  if (input.action === "unmark") {
    await db.delete(unknownWords).where(and(eq(unknownWords.userId, uid), eq(unknownWords.normalized, normalized)));
    return Response.json({ active: false, normalized });
  }
  const current = await db
    .select()
    .from(unknownWords)
    .where(and(eq(unknownWords.userId, uid), eq(unknownWords.normalized, normalized)))
    .limit(1);
  const now = Date.now();
  const contexts = current[0] ? parseList(current[0].contexts) : [];
  const documentIds = current[0] ? parseList(current[0].documentIds) : [];
  const context = String(input.context || "").trim().slice(0, 500);
  const documentId = String(input.documentId || "").trim().slice(0, 100);
  if (context && !contexts.includes(context)) contexts.unshift(context);
  if (documentId && !documentIds.includes(documentId)) documentIds.unshift(documentId);
  await db
    .insert(unknownWords)
    .values({
      userId: uid,
      normalized,
      display,
      clickCount: 1,
      contexts: JSON.stringify(contexts.slice(0, 8)),
      documentIds: JSON.stringify(documentIds.slice(0, 20)),
      firstClickedAt: now,
      lastClickedAt: now,
    })
    .onConflictDoUpdate({
      target: [unknownWords.userId, unknownWords.normalized],
      set: {
        display,
        clickCount: (current[0]?.clickCount ?? 0) + 1,
        contexts: JSON.stringify(contexts.slice(0, 8)),
        documentIds: JSON.stringify(documentIds.slice(0, 20)),
        lastClickedAt: now,
      },
    });
  return Response.json({ active: true, normalized });
}
