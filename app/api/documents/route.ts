import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { readingDocuments } from "@/db/schema";

const OWNER_KEY = "site-owner";

export async function GET(request: Request) {
  void request;
  const uid = OWNER_KEY;
  const rows = await getDb()
    .select()
    .from(readingDocuments)
    .where(eq(readingDocuments.userId, uid))
    .orderBy(desc(readingDocuments.updatedAt));
  return Response.json({ documents: rows });
}

export async function POST(request: Request) {
  const uid = OWNER_KEY;
  const input = (await request.json()) as {
    id?: string;
    title?: string;
    body?: string;
    questions?: string;
  };
  const id = String(input.id || crypto.randomUUID());
  const title = String(input.title || "未命名阅读").trim().slice(0, 120);
  const body = String(input.body || "").trim();
  const questions = String(input.questions || "").trim();
  if (!body) return Response.json({ error: "阅读正文不能为空。" }, { status: 400 });
  if (body.length > 80_000 || questions.length > 30_000) {
    return Response.json({ error: "单份材料过长，请拆分后导入。" }, { status: 400 });
  }
  const now = Date.now();
  const existing = await getDb()
    .select({ id: readingDocuments.id, createdAt: readingDocuments.createdAt })
    .from(readingDocuments)
    .where(and(eq(readingDocuments.id, id), eq(readingDocuments.userId, uid)))
    .limit(1);
  await getDb()
    .insert(readingDocuments)
    .values({ id, userId: uid, title, body, questions, createdAt: existing[0]?.createdAt ?? now, updatedAt: now })
    .onConflictDoUpdate({
      target: readingDocuments.id,
      set: { title, body, questions, updatedAt: now },
    });
  const saved = await getDb()
    .select()
    .from(readingDocuments)
    .where(and(eq(readingDocuments.id, id), eq(readingDocuments.userId, uid)))
    .limit(1);
  return Response.json({ document: saved[0] });
}
