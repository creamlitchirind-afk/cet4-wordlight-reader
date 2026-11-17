import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { exclusionEvents, optionExclusions, readingAnswers, readingDocuments } from "@/db/schema";
import { evidenceMatches, type Evidence } from "@/lib/exclusions";
const uid = "site-owner";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("documentId");
  const db = getDb();
  const rows = await db.select().from(optionExclusions).where(id ? and(eq(optionExclusions.userId, uid), eq(optionExclusions.documentId, id)) : eq(optionExclusions.userId, uid));
  const history = await db.select().from(exclusionEvents).where(id ? and(eq(exclusionEvents.userId, uid), eq(exclusionEvents.documentId, id)) : eq(exclusionEvents.userId, uid)).orderBy(desc(exclusionEvents.createdAt)).limit(500);
  return Response.json({ exclusions: rows.map(r => ({ ...r, evidence: JSON.parse(r.evidence) })), history: history.map(r => ({ ...r, evidence: JSON.parse(r.evidence) })) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "记录格式无效。" }, { status: 400 }); }
  if (!input || typeof input.documentId !== "string" || !Number.isInteger(input.questionNumber) || typeof input.option !== "string" || !/^[A-D]$/.test(input.option) || typeof input.excluded !== "boolean" || typeof input.reason !== "string" || input.reason.length > 2000 || !Array.isArray(input.evidence) || input.evidence.length > 10) return Response.json({ error: "记录无效：理由限2000字，原句最多10句。" }, { status: 400 });
  const { documentId, option, excluded } = input;
  const questionNumber = Number(input.questionNumber);
  const db = getDb();
  const docs = await db.select().from(readingDocuments).where(eq(readingDocuments.userId, uid));
  const doc = docs.find(d => d.id === documentId);
  const block = doc?.questions.match(new RegExp(`(?:^|\\n)${questionNumber}[.、)]\\s*([\\s\\S]*?)(?=\\n\\d+[.、)]|$)`))?.[1];
  if (!doc || !block || !new RegExp(`(?:^|\\n)${option}[).、]\\s*`, "i").test(block)) return Response.json({ error: "题目或选项已更新，请刷新后再试。" }, { status: 400 });
  const key = and(eq(optionExclusions.userId, uid), eq(optionExclusions.documentId, documentId), eq(optionExclusions.questionNumber, questionNumber), eq(optionExclusions.option, option));
  const old = (await db.select().from(optionExclusions).where(key).limit(1))[0];
  let evidence: Evidence[] = [];
  let reason = input.reason.trim();
  if (excluded) {
    const selected = (await db.select().from(readingAnswers).where(and(eq(readingAnswers.userId, uid), eq(readingAnswers.documentId, documentId), eq(readingAnswers.questionNumber, questionNumber))).limit(1))[0];
    if (selected?.selectedOption === option) return Response.json({ error: "这个选项是当前答案，请先选择其他答案或暂时不会，再排除它。" }, { status: 409 });
    for (const raw of input.evidence) {
      const e = raw as Evidence;
      const source = e && docs.find(d => d.id === e.documentId && (d.id === doc.id || (doc.passageId && d.passageId === doc.passageId)));
      // Existing snapshots remain valid as history even if their source was later edited.
      const retained = old && (JSON.parse(old.evidence) as Evidence[]).some(p => JSON.stringify(p) === JSON.stringify(e));
      if (!retained && (!source || !evidenceMatches(e, source))) return Response.json({ error: "原文已变化或引句不属于本篇，请重新选择原句。" }, { status: 409 });
      evidence.push(retained ? e : { ...e, title: source!.title });
    }
  } else {
    if (!old) return Response.json({ error: "尚无排除记录。" }, { status: 400 });
    evidence = JSON.parse(old.evidence); reason = old.reason;
  }
  const now = Date.now();
  const values = { userId: uid, documentId, questionNumber, option, excluded, reason, evidence: JSON.stringify(evidence), updatedAt: now };
  const event = { ...values, id: crypto.randomUUID(), createdAt: now };
  await db.batch([db.insert(optionExclusions).values(values).onConflictDoUpdate({ target: [optionExclusions.userId, optionExclusions.documentId, optionExclusions.questionNumber, optionExclusions.option], set: values }), db.insert(exclusionEvents).values(event)]);
  return Response.json({ exclusion: { ...values, evidence }, event: { ...event, evidence } });
}
