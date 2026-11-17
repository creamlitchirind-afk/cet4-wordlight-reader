import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { readingAnswers } from "@/db/schema";

const OWNER_KEY = "site-owner";
const VALID_OPTIONS = new Set(["A", "B", "C", "D", "?"]);

export async function GET(request: Request) {
  const documentId = new URL(request.url).searchParams.get("documentId")?.trim().slice(0, 100) || "";
  const rows = await getDb()
    .select()
    .from(readingAnswers)
    .where(documentId ? and(eq(readingAnswers.userId, OWNER_KEY), eq(readingAnswers.documentId, documentId)) : eq(readingAnswers.userId, OWNER_KEY))
    .orderBy(asc(readingAnswers.questionNumber));
  return Response.json({ answers: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const input = (await request.json()) as {
    documentId?: string;
    questionNumber?: number;
    selectedOption?: string;
  };
  const documentId = String(input.documentId || "").trim().slice(0, 100);
  const questionNumber = Number(input.questionNumber);
  const selectedOption = String(input.selectedOption || "").toUpperCase();
  if (!documentId || !Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 999 || !VALID_OPTIONS.has(selectedOption)) {
    return Response.json({ error: "答题记录无效。" }, { status: 400 });
  }
  const now = Date.now();
  await getDb()
    .insert(readingAnswers)
    .values({ userId: OWNER_KEY, documentId, questionNumber, selectedOption, updatedAt: now })
    .onConflictDoUpdate({
      target: [readingAnswers.userId, readingAnswers.documentId, readingAnswers.questionNumber],
      set: { selectedOption, updatedAt: now },
    });
  return Response.json({ answer: { documentId, questionNumber, selectedOption, updatedAt: now } });
}
