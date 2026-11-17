import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { answerEvents, exclusionEvents, optionExclusions, readingAnswers, readingDocuments, unknownWords, wordEvents } from "@/db/schema";
import { STAGE_LABELS } from "@/lib/word-memory";

const VERSION = "2026-07-28";
const OWNER_KEY = "site-owner";

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function reply(id: unknown, result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status });
}

function failure(id: unknown, message: string, status = 400) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message } },
    { status },
  );
}

export async function POST(request: Request) {
  const uid = OWNER_KEY;
  const payload = (await request.json()) as {
    id?: unknown;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };
  if (payload.method === "server/discover") {
    return reply(payload.id, { supportedVersions: [VERSION], capabilities: { tools: {} } });
  }
  if (payload.method === "tools/list") {
    return reply(payload.id, {
      tools: [
        {
          name: "list_unknown_words",
          description: "列出用户在四级阅读中点击标记的生词、点击次数和原句上下文。",
          inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200 } }, additionalProperties: false },
        },
        {
          name: "get_word_contexts",
          description: "读取一个已标记生词的原句上下文。",
          inputSchema: { type: "object", properties: { word: { type: "string" } }, required: ["word"], additionalProperties: false },
        },
        {
          name: "list_reading_documents",
          description: "列出用户已导入的四级阅读材料及更新时间。",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
        {
          name: "get_reading_document",
          description: "按材料ID读取已导入的阅读正文与题目。",
          inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
        },
        {
          name: "upsert_reading_document",
          description: "直接导入或更新一份四级阅读材料，供用户在网站中点词。",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              questions: { type: "string" },
              passageId: { type: "string", description: "同一篇阅读的各碎片使用相同标识；每个碎片仍保留自己的id，页面会把新题排在旧题上方。" },
            },
            required: ["title", "body"],
            additionalProperties: false,
          },
        },
        {
          name: "get_word_memory_history",
          description: "读取单词的记忆颜色阶段和最近100次弄懂、记住、遗忘操作。stage为0琥珀，1至3蓝色渐浅，4无色，-1误点取消。升级至少间隔24小时。",
          inputSchema: { type: "object", properties: { word: { type: "string" } }, required: ["word"], additionalProperties: false },
        },
        {
          name: "list_reading_answers",
          description: "读取用户在四级阅读题中选择的选项；问号表示用户明确选择了‘暂时不会’。",
          inputSchema: {
            type: "object",
            properties: { documentId: { type: "string" } },
            additionalProperties: false,
          },
        },
        {
          name: "get_reading_reasoning",
          description: "读取用户排除选项的当前状态、文字理由、原文引句及最近500条排除／撤销历史。只是用户判断，不是标准答案。",
          inputSchema: { type: "object", properties: { documentId: { type: "string" } }, additionalProperties: false },
        },
      ],
    });
  }
  if (payload.method !== "tools/call") return failure(payload.id, "Unsupported method.");
  const name = payload.params?.name;
  const args = payload.params?.arguments ?? {};
  const db = getDb();
  if (name === "get_reading_reasoning") {
    const documentId = String(args.documentId || "").trim();
    const rows = await db.select().from(optionExclusions).where(documentId ? and(eq(optionExclusions.userId, uid), eq(optionExclusions.documentId, documentId)) : eq(optionExclusions.userId, uid));
    const history = await db.select().from(exclusionEvents).where(documentId ? and(eq(exclusionEvents.userId, uid), eq(exclusionEvents.documentId, documentId)) : eq(exclusionEvents.userId, uid)).orderBy(desc(exclusionEvents.createdAt)).limit(500);
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify({ exclusions: rows.map(r => ({ ...r, evidence: parseList(r.evidence) })), history: history.map(r => ({ ...r, evidence: parseList(r.evidence) })), note: "这是用户的排除思路，不代表标准答案；引句是保存时快照。历史最多返回最近500条。" }, null, 2) }] });
  }
  if (name === "list_unknown_words") {
    const limit = Math.min(200, Math.max(1, Number(args.limit || 100)));
    const rows = await db.select().from(unknownWords).where(eq(unknownWords.userId, uid)).orderBy(desc(unknownWords.lastClickedAt)).limit(limit);
    const data = rows.map((row) => ({
      word: row.display,
      normalized: row.normalized,
      clickCount: row.clickCount,
      stage: row.stage,
      memoryStatus: STAGE_LABELS[row.stage],
      recallCount: row.recallCount,
      forgetCount: row.forgetCount,
      lastAdvancedAt: row.lastAdvancedAt ? new Date(row.lastAdvancedAt).toISOString() : null,
      contexts: parseList(row.contexts),
      lastClickedAt: new Date(row.lastClickedAt).toISOString(),
    }));
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
  }
  if (name === "get_word_contexts") {
    const word = String(args.word || "").toLowerCase().trim();
    const rows = await db.select().from(unknownWords).where(and(eq(unknownWords.userId, uid), eq(unknownWords.normalized, word))).limit(1);
    const data = rows[0] ? { word: rows[0].display, contexts: parseList(rows[0].contexts), clickCount: rows[0].clickCount } : { word, contexts: [], clickCount: 0 };
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
  }
  if (name === "get_word_memory_history") {
    const word = String(args.word || "").toLowerCase().trim();
    const state = await db.select().from(unknownWords).where(and(eq(unknownWords.userId, uid), eq(unknownWords.normalized, word))).limit(1);
    const history = await db.select().from(wordEvents).where(and(eq(wordEvents.userId, uid), eq(wordEvents.normalized, word))).orderBy(desc(wordEvents.createdAt)).limit(100);
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify({ state: state[0] ?? null, history, limit: 100 }, null, 2) }] });
  }
  if (name === "list_reading_documents") {
    const rows = await db.select({ id: readingDocuments.id, title: readingDocuments.title, updatedAt: readingDocuments.updatedAt }).from(readingDocuments).where(eq(readingDocuments.userId, uid)).orderBy(desc(readingDocuments.updatedAt));
    const data = rows.map((row) => ({ ...row, updatedAt: new Date(row.updatedAt).toISOString() }));
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
  }
  if (name === "get_reading_document") {
    const id = String(args.id || "").trim();
    const rows = await db.select().from(readingDocuments).where(and(eq(readingDocuments.userId, uid), eq(readingDocuments.id, id))).limit(1);
    const data = rows[0] ?? null;
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
  }
  if (name === "upsert_reading_document") {
    const id = String(args.id || crypto.randomUUID()).trim().slice(0, 100);
    const title = String(args.title || "未命名阅读").trim().slice(0, 120);
    const body = String(args.body || "").trim();
    const questions = String(args.questions || "").trim();
    if (!body || body.length > 80_000 || questions.length > 30_000) {
      return reply(payload.id, { content: [{ type: "text", text: "正文为空或材料过长。" }], isError: true });
    }
    const now = Date.now();
    const existing = await db.select({ createdAt: readingDocuments.createdAt, passageId: readingDocuments.passageId }).from(readingDocuments).where(and(eq(readingDocuments.userId, uid), eq(readingDocuments.id, id))).limit(1);
    const passageId = args.passageId === undefined ? existing[0]?.passageId ?? "" : String(args.passageId).trim().slice(0, 120);
    await db.insert(readingDocuments).values({ id, userId: uid, title, passageId, body, questions, createdAt: existing[0]?.createdAt ?? now, updatedAt: now }).onConflictDoUpdate({
      target: readingDocuments.id,
      set: { title, passageId, body, questions, updatedAt: now },
    });
    const data = { id, title, updatedAt: new Date(now).toISOString() };
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
  }
  if (name === "list_reading_answers") {
    const documentId = String(args.documentId || "").trim();
    const rows = documentId
      ? await db.select().from(readingAnswers).where(and(eq(readingAnswers.userId, uid), eq(readingAnswers.documentId, documentId))).orderBy(readingAnswers.questionNumber)
      : await db.select().from(readingAnswers).where(eq(readingAnswers.userId, uid)).orderBy(desc(readingAnswers.updatedAt));
    const history = await db.select().from(answerEvents).where(documentId ? and(eq(answerEvents.userId, uid), eq(answerEvents.documentId, documentId)) : eq(answerEvents.userId, uid)).orderBy(desc(answerEvents.createdAt)).limit(500);
    const exclusions = await db.select().from(optionExclusions).where(documentId ? and(eq(optionExclusions.userId, uid), eq(optionExclusions.documentId, documentId)) : eq(optionExclusions.userId, uid));
    const reasoningHistory = await db.select().from(exclusionEvents).where(documentId ? and(eq(exclusionEvents.userId, uid), eq(exclusionEvents.documentId, documentId)) : eq(exclusionEvents.userId, uid)).orderBy(desc(exclusionEvents.createdAt)).limit(500);
    const questions: { documentId: string; questionNumber: number; selectedOption: string | null; updatedAt: number }[] = [...rows];
    for (const e of exclusions) if (!questions.some(q => q.documentId === e.documentId && q.questionNumber === e.questionNumber)) questions.push({ documentId: e.documentId, questionNumber: e.questionNumber, selectedOption: null, updatedAt: e.updatedAt });
    const data = questions.map((row) => ({
      documentId: row.documentId,
      questionNumber: row.questionNumber,
      selectedOption: row.selectedOption,
      status: row.selectedOption === null ? "尚未选择，仅有排除思路" : row.selectedOption === "?" ? "暂时不会" : "已选择",
      exclusions: exclusions.filter(e => e.documentId === row.documentId && e.questionNumber === row.questionNumber).map(e => ({ ...e, evidence: parseList(e.evidence) })),
      exclusionHistory: reasoningHistory.filter(e => e.documentId === row.documentId && e.questionNumber === row.questionNumber).map(e => ({ ...e, evidence: parseList(e.evidence) })),
      updatedAt: new Date(row.updatedAt).toISOString(),
      history: history.filter((event) => event.documentId === row.documentId && event.questionNumber === row.questionNumber),
      historyNote: "历史从功能上线后开始记录；previousOption可能是旧版保存的最后答案，不等于首次独立答案。",
    }));
    return reply(payload.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
  }
  return reply(payload.id, { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true });
}
