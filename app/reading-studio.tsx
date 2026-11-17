"use client";

import { BookOpen, Check, CircleHelp, ClipboardCopy, Download, FileUp, Highlighter, Leaf, Plus, RefreshCw, Save, Sparkles, X } from "lucide-react";
import { ChangeEvent, KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isReviewCandidate, normalizeWord, pageWordForms, STAGE_LABELS, type WordAction } from "@/lib/word-memory";
import { ReviewBreak, WordMemoryDialog, type MemoryWord, type WordSelection } from "./word-memory-controls";

type ReadingDocument = { id: string; title: string; passageId?: string; body: string; questions: string; createdAt?: number; updatedAt?: number };
type WordRecord = MemoryWord & { clickCount: number; lastClickedAt: number; lastAdvancedAt: number };
type ParsedQuestion = { number: number; prompt: string; options: { letter: string; text: string }[] };
type AnswerRecord = { documentId: string; questionNumber: number; selectedOption: string; updatedAt: number };
type AnswerEvent = { id: string; documentId: string; questionNumber: number; selectedOption: string; previousOption: string; mode: string; createdAt: number };

const sample: ReadingDocument = {
  id: "sample-mars-potato",
  title: "示例：火星土豆",
  body: "An experienced professor started a campaign to prove that a potato was an organism from Mars. He opened an account for research donations and put the potato in charge of the laboratory. Visitors paid one coin, but the potato never gave them change. A reporter cited it as evidence of alien life, so its credit grew across the capital. Then the professor had to confess: the potato's origin was his lunch box. The city faced a civil question—should it cancel the science parade? It kept the parade and renamed it ‘How Humans Turn Lunch into Research.’",
  questions: "1. Why did the professor start the campaign?\nA) To raise money for lunch\nB) To prove the potato came from Mars\nC) To open a bank account\nD) To cancel a parade",
};

function sentenceAt(text: string, offset: number) {
  const leftCandidates = [text.lastIndexOf(".", offset - 1), text.lastIndexOf("?", offset - 1), text.lastIndexOf("!", offset - 1), text.lastIndexOf("\n", offset - 1)];
  const left = Math.max(...leftCandidates) + 1;
  const tails = [text.indexOf(".", offset), text.indexOf("?", offset), text.indexOf("!", offset), text.indexOf("\n", offset)].filter((value) => value >= 0);
  const right = tails.length ? Math.min(...tails) + 1 : text.length;
  return text.slice(left, right).trim();
}

function wordCount(text: string) {
  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
}

function parseQuestions(raw: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;
  for (const originalLine of raw.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line) continue;
    const questionMatch = line.match(/^(\d+)[.、)]\s*(.*)$/);
    if (questionMatch) {
      current = { number: Number(questionMatch[1]), prompt: questionMatch[2], options: [] };
      questions.push(current);
      continue;
    }
    const optionMatch = line.match(/^([A-D])[).、]\s*(.*)$/i);
    if (optionMatch && current) {
      current.options.push({ letter: optionMatch[1].toUpperCase(), text: optionMatch[2] });
      continue;
    }
    if (current) current.prompt = `${current.prompt} ${line}`.trim();
  }
  return questions;
}

export default function ReadingStudio() {
  const [documents, setDocuments] = useState<ReadingDocument[]>([]);
  const [current, setCurrent] = useState<ReadingDocument>(sample);
  const [words, setWords] = useState<WordRecord[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerHistory, setAnswerHistory] = useState<AnswerEvent[]>([]);
  const [answerModes, setAnswerModes] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [showMastered, setShowMastered] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const syncLock = useRef(false);
  const writes = useRef(0);
  const revision = useRef(0);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("点击正文、题干或选项里的英文单词，选择记忆状态即可保存。");

  const wordMap = useMemo(() => new Map(words.map((word) => [word.normalized, word])), [words]);
  const learningWords = words.filter((word) => word.stage >= 0 && word.stage < 4);
  const listedWords = showMastered ? words.filter((word) => word.stage >= 0) : learningWords;
  const related = useMemo(() => (current.passageId
    ? documents.filter((doc) => doc.passageId === current.passageId)
    : [current]).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)), [current, documents]);
  const parsedQuestions = useMemo(() => related.flatMap((doc) => parseQuestions(doc.questions).map((q) => ({ ...q, documentId: doc.id, sourceTitle: doc.title }))), [related]);
  const answeredCount = parsedQuestions.filter((q) => answers[`${q.documentId}:${q.number}`]).length;
  const library = useMemo(() => documents.filter((doc, index, all) => !doc.passageId || all.findIndex((item) => item.passageId === doc.passageId) === index), [documents]);
  const reviewCandidates = useMemo(() => {
    const excluded = pageWordForms(related.map((doc) => `${doc.body}\n${doc.questions}`).join("\n"));
    return words.filter((word) => isReviewCandidate(word, excluded));
  }, [related, words]);

  const refreshMaterials = useCallback(async (manual = false) => {
    if (showImport) { if (manual) setNotice("请先保存或关闭导入编辑，再刷新材料。"); return; }
    if (syncLock.current || writes.current) { if (manual) setNotice("正在保存，请稍后刷新。"); return; }
    syncLock.current = true;
    setSyncing(true);
    const started = revision.current;
    try {
      const [docData, wordData, answerData] = await Promise.all(["/api/documents", "/api/words", "/api/answers"].map(async (url) => {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("同步失败");
        return response.json() as Promise<{ documents?: ReadingDocument[]; words?: WordRecord[]; answers?: AnswerRecord[]; history?: AnswerEvent[] }>;
      }));
      if (started !== revision.current || writes.current) return;
      const saved: ReadingDocument[] = docData.documents ?? [];
      setDocuments(saved);
      setCurrent((previous) => saved.find((doc) => doc.id === previous.id) ?? (previous.id === sample.id ? saved[0] ?? previous : previous));
      setWords(wordData.words ?? []);
      const next: Record<string, string> = {};
      for (const answer of (answerData.answers ?? []) as AnswerRecord[]) next[`${answer.documentId}:${answer.questionNumber}`] = answer.selectedOption;
      setAnswers(next);
      setAnswerHistory(answerData.history ?? []);
      setLastSynced(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      if (manual) setNotice("已从云端重新获取最新材料、答案和生词；学习记录已保留。");
    } catch {
      setNotice("暂时无法同步，已保留页面内容。网络恢复后自动重试，也可点击刷新材料。");
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [showImport]);

  useEffect(() => {
    const sync = () => { if (document.visibilityState !== "hidden") void refreshMaterials(); };
    const initial = window.setTimeout(sync, 0);
    const timer = window.setInterval(sync, 15000);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      revision.current += 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refreshMaterials]);

  async function saveDocument() {
    setBusy(true);
    try {
      const response = await fetch("/api/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(current) });
      const data = await response.json() as { error?: string; document: ReadingDocument };
      if (!response.ok) throw new Error(data.error || "保存失败");
      const saved = data.document as ReadingDocument;
      setCurrent(saved);
      setDocuments((existing) => [saved, ...existing.filter((item) => item.id !== saved.id)]);
      setShowImport(false);
      setNotice("材料已保存。正文、题干和选项中的生词都可以直接点亮。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function changeWord(display: string, context: string, documentId: string, action: WordAction): Promise<boolean> {
    const normalized = normalizeWord(display);
    if (!normalized || writes.current) return false;
    revision.current += 1;
    writes.current += 1;
    setMemoryBusy(true);
    try {
      const response = await fetch("/api/words", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, word: display, context, documentId }) });
      if (!response.ok) throw new Error();
      const data = await response.json() as { word: WordRecord; advanced: boolean };
      setWords((existing) => [data.word, ...existing.filter((word) => word.normalized !== normalized)]);
      setNotice(`${display}：${STAGE_LABELS[data.word.stage]}。${action === "remembered" && !data.advanced ? "回忆已记录；距离上次升级不足24小时，或已暂时掌握，颜色保持。" : "已保存。"}`);
      return true;
    } catch {
      setNotice("这次记忆操作没有保存成功，请重试；原记录已保留。");
      return false;
    } finally {
      writes.current -= 1;
      setMemoryBusy(false);
    }
  }

  function openWord(display: string, context: string, documentId = current.id) {
    setSelection({ display, context, documentId });
  }

  async function selectAnswer(documentId: string, questionNumber: number, selectedOption: string) {
    if (writes.current) return;
    revision.current += 1;
    writes.current += 1;
    const key = `${documentId}:${questionNumber}`;
    const previous = answers[key];
    const mode = answerModes[key] ?? answerHistory.find((event) => event.documentId === documentId && event.questionNumber === questionNumber)?.mode ?? (previous ? "correction" : "independent");
    setAnswers((existing) => ({ ...existing, [key]: selectedOption }));
    setNotice(selectedOption === "?" ? `第${questionNumber}题已记为“暂时不会”。` : `第${questionNumber}题已选择 ${selectedOption}。`);
    try {
      const response = await fetch("/api/answers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId, questionNumber, selectedOption, mode }) });
      if (!response.ok) throw new Error();
      const data = await response.json() as { event: AnswerEvent };
      setAnswerHistory((history) => [data.event, ...history]);
    } catch {
      setAnswers((existing) => {
        const next = { ...existing };
        if (previous) next[key] = previous;
        else delete next[key];
        return next;
      });
      setNotice("答案没有保存成功，请再选一次。");
    } finally {
      writes.current -= 1;
    }
  }

  function renderInteractiveText(text: string, fixedContext?: string, documentId = current.id) {
    const pieces = text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g);
    let offset = 0;
    return pieces.map((piece, index) => {
      const start = offset;
      offset += piece.length;
      if (!/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(piece)) return <span key={`${index}-${start}`}>{piece}</span>;
      const record = wordMap.get(normalizeWord(piece));
      const stage = record?.stage ?? -1;
      return (
        <button type="button" key={`${index}-${start}`} className={`word-token memory-stage-${stage}`} aria-pressed={stage >= 0 && stage < 4} title={`${stage >= 0 ? STAGE_LABELS[stage] : "未标记"} · 点击记录记忆状态`}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); openWord(piece, fixedContext || sentenceAt(text, start), documentId); }}>
          {piece}
        </button>
      );
    });
  }

  function handleOptionKey(event: KeyboardEvent<HTMLDivElement>, documentId: string, questionNumber: number, letter: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectAnswer(documentId, questionNumber, letter);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    let next: ReadingDocument;
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        const parsed = JSON.parse(raw);
        next = { id: String(parsed.id || crypto.randomUUID()), passageId: String(parsed.passageId || ""), title: String(parsed.title || file.name.replace(/\.json$/i, "")), body: String(parsed.body || parsed.text || ""), questions: Array.isArray(parsed.questions) ? parsed.questions.join("\n") : String(parsed.questions || "") };
      } catch {
        setNotice("JSON格式无法识别，请检查title、body/text和questions字段。");
        return;
      }
    } else next = { id: crypto.randomUUID(), title: file.name.replace(/\.(txt|md)$/i, ""), body: raw, questions: "" };
    setCurrent(next);
    setShowImport(true);
    event.target.value = "";
  }

  function newImport() {
    setCurrent({ id: crypto.randomUUID(), title: "", body: "", questions: "" });
    setShowImport(true);
  }

  async function copySummary() {
    const lines = words.filter((word) => word.stage >= 0).map((word) => `- ${word.display}｜${STAGE_LABELS[word.stage]}｜回忆${word.recallCount}次，遗忘${word.forgetCount}次${word.contexts[0] ? `｜${word.contexts[0]}` : ""}`);
    await navigator.clipboard.writeText(`# 本次点词记录\n\n${lines.join("\n") || "暂无生词"}`);
    setNotice("生词记录已复制。");
  }

  function downloadSummary() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), document: current.title, answers, answerHistory, words }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `四级阅读记录-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="reader-shell min-h-screen text-[#26322d]">
      <header className="reader-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark"><Leaf size={20} /></div>
            <div className="min-w-0"><h1 className="truncate text-lg font-bold tracking-tight">四级点词阅读器</h1><p className="truncate text-xs text-[#718078]">读懂、点亮、作答，一次完成</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="secondary-button" disabled={syncing || showImport} onClick={() => void refreshMaterials(true)} title="跳过缓存重新获取材料；不会清除答案和生词" aria-label="刷新材料"><RefreshCw size={16} className={syncing ? "animate-spin" : ""} /><span className="hidden sm:inline">{syncing ? "同步中" : "刷新材料"}</span></button>
            <label className="secondary-button cursor-pointer"><FileUp size={16} /> <span className="hidden sm:inline">导入文件</span><input type="file" accept=".txt,.md,.json,text/plain,application/json" className="sr-only" onChange={importFile} /></label>
            <button type="button" className="primary-button" onClick={newImport}><Plus size={16} /> <span className="hidden sm:inline">新建导入</span></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] grid-cols-1 gap-4 px-4 py-5 lg:grid-cols-[210px_minmax(0,1fr)_300px] lg:px-7">
        <aside className="paper-panel order-2 p-4 lg:order-1 lg:sticky lg:top-[86px] lg:h-[calc(100vh-106px)]">
          <div className="mb-3 flex items-center justify-between"><h2 className="section-label"><BookOpen size={15} /> 阅读库</h2><span className="count-pill">{library.length}</span></div>
          <p className="mb-3 text-xs text-[#718078]">每15秒自动同步 · {lastSynced || "正在连接"}</p>
          <div className="space-y-2 overflow-auto lg:max-h-[calc(100vh-160px)]">
            {documents.length === 0 && <p className="soft-note">还没有保存的材料。可以先体验示例，或导入TXT、MD、JSON。</p>}
            {library.map((document) => (
              <button type="button" key={document.id} className={`library-item ${current.id === document.id || (current.passageId && current.passageId === document.passageId) ? "library-item-active" : ""}`} onClick={() => { setCurrent(document); setShowImport(false); }}>
                <span className="line-clamp-2 font-semibold">{document.title}</span><span className="mt-1 block text-xs opacity-60">{wordCount(document.body)}词</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          {showImport ? (
            <div className="paper-panel p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">IMPORT READING</p><h2 className="text-2xl font-bold">导入阅读材料</h2></div><button type="button" className="icon-button" onClick={() => setShowImport(false)} aria-label="关闭导入"><X size={18} /></button></div>
              <label className="field-label">标题<input className="text-input" value={current.title} onChange={(event) => setCurrent({ ...current, title: event.target.value })} placeholder="例如：2025年6月四级 Passage One" /></label>
              <label className="field-label">同篇阅读标识（可选）<input className="text-input" value={current.passageId || ""} onChange={(event) => setCurrent({ ...current, passageId: event.target.value })} placeholder="同一篇的各次导入填写相同标识，旧题会保留" /></label>
              <label className="field-label">阅读正文<textarea className="text-area min-h-64" value={current.body} onChange={(event) => setCurrent({ ...current, body: event.target.value })} placeholder="粘贴英文正文，或使用右上角导入TXT/MD/JSON…" /></label>
              <label className="field-label">题目与选项<textarea className="text-area min-h-36" value={current.questions} onChange={(event) => setCurrent({ ...current, questions: event.target.value })} placeholder="格式示例：47. 题干，下一行 A) 选项" /></label>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#718078]">保存后，正文、题干和选项里的英文词都可点击。</p><button type="button" className="primary-button" disabled={busy} onClick={saveDocument}><Save size={16} /> {busy ? "保存中…" : "保存并开始阅读"}</button></div>
            </div>
          ) : (
            <article className="paper-panel overflow-hidden">
              <div className="article-head px-5 py-5 sm:px-9"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">FOCUSED READING</p><h2 className="max-w-3xl text-2xl font-bold sm:text-3xl">{current.title}</h2></div><div className="flex gap-2"><span className="stat-chip">{wordCount(current.body)}词</span><span className="stat-chip stat-chip-amber">{learningWords.length}个待巩固词</span></div></div></div>
              <div className="px-5 py-8 sm:px-11 sm:py-11">
                {related.map((doc, index) => <section key={doc.id} className={index ? "mt-7 border-t border-[#26322d]/10 pt-5" : ""}>
                  {related.length > 1 && <p className="eyebrow">{index === 0 ? "最新阅读片段" : "之前的阅读片段"} · {doc.title}</p>}
                  <div className="reading-text" style={{ minHeight: 0 }}>{renderInteractiveText(doc.body, undefined, doc.id)}</div>
                </section>)}
              </div>
              {parsedQuestions.length > 0 && (
                <div className="question-zone px-5 py-7 sm:px-9 sm:py-9">
                  <div className="mb-5 flex items-center justify-between gap-3"><div><p className="eyebrow">COMPREHENSION</p><h3 className="text-xl font-bold">阅读题</h3></div><span className="progress-pill">{answeredCount}/{parsedQuestions.length} 已记录</span></div>
                  <div className="space-y-6">
                    {parsedQuestions.map((question, index) => {
                      const selected = answers[`${question.documentId}:${question.number}`];
                      return (
                        <section className="question-card" key={`${question.documentId}:${question.number}`}>
                          <p className="eyebrow">{index === 0 ? "最新题目" : "保留题目"} · {question.sourceTitle}</p>
                          <div className="question-title"><span className="question-number">{question.number}</span><p>{renderInteractiveText(question.prompt, `${question.number}. ${question.prompt}`, question.documentId)}</p></div>
                          <label className="mt-3 flex items-center gap-2 text-xs text-[#637067]">本次作答<select aria-label={`第${question.number}题作答方式`} value={answerModes[`${question.documentId}:${question.number}`] ?? answerHistory.find((event) => event.documentId === question.documentId && event.questionNumber === question.number)?.mode ?? (selected ? "correction" : "independent")} onChange={(event) => setAnswerModes((existing) => ({ ...existing, [`${question.documentId}:${question.number}`]: event.target.value }))} className="rounded border p-1"><option value="independent">独立作答 / 未看讲解</option><option value="correction">看过讲解后的订正</option></select></label>
                          {question.options.length > 0 && (
                            <div className="mt-4 grid gap-2.5" role="radiogroup" aria-label={`第${question.number}题选项`}>
                              {question.options.map((option) => {
                                const isSelected = selected === option.letter;
                                const context = `${question.number}. ${question.prompt} ${option.letter}) ${option.text}`;
                                return (
                                  <div key={option.letter} className={`option-card ${isSelected ? "option-card-selected" : ""}`} role="radio" aria-checked={isSelected} tabIndex={0} onClick={() => selectAnswer(question.documentId, question.number, option.letter)} onKeyDown={(event) => handleOptionKey(event, question.documentId, question.number, option.letter)}>
                                    <span className="option-letter">{isSelected ? <Check size={16} /> : option.letter}</span><span className="option-text">{renderInteractiveText(option.text, context, question.documentId)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <button type="button" className={`unsure-button ${selected === "?" ? "unsure-button-selected" : ""}`} onClick={() => selectAnswer(question.documentId, question.number, "?")}><CircleHelp size={16} /> {selected === "?" ? "已记录：暂时不会" : "暂时不会，先记录"}</button>
                          <details className="mt-3 text-xs leading-6 text-[#637067]"><summary>作答历史</summary>
                            {answerHistory.filter((event) => event.documentId === question.documentId && event.questionNumber === question.number).map((event) => <p key={event.id}>{new Date(event.createdAt).toLocaleString("zh-CN")} · {event.mode === "correction" ? "讲解后订正" : "独立作答"} · {event.previousOption ? `${event.previousOption} → ` : ""}{event.selectedOption === "?" ? "暂时不会" : event.selectedOption}</p>)}
                            <p>从本功能上线起记录；旧版已有的最后选择不等于首次独立答案。</p>
                          </details>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          )}
          <output className="notice-bar mt-3" aria-live="polite"><Sparkles size={15} className="shrink-0 text-[#a56b19]" />{notice}</output>
        </section>

        <aside className="paper-panel order-3 p-4 sm:p-5 lg:sticky lg:top-[86px] lg:max-h-[calc(100vh-106px)] overflow-auto">
          <ReviewBreak key={current.passageId || current.id} candidates={reviewCandidates} busy={memoryBusy} onAction={(word, action) => changeWord(word.display, word.contexts[0] || "", word.documentIds[0] || "", action)} />
          <div className="mb-3 mt-5 flex items-center justify-between"><h2 className="section-label"><Highlighter size={15} /> 生词灯</h2><span className="count-pill count-pill-amber">{learningWords.length}</span></div>
          <p className="mb-3 text-xs leading-6 text-[#718078]">琥珀：忘了 · 深蓝：弄懂了<br />蓝色逐渐变浅 → 无色：暂时掌握</p>
          <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={showMastered} onChange={(event) => setShowMastered(event.target.checked)} />也显示已掌握的词</label>
          <div className="mb-4 max-h-[38vh] space-y-2 overflow-auto pr-1">
            {listedWords.length === 0 && <div className="empty-words"><Highlighter size={24} /><p>暂无待展示词汇<br />点击正文中的词记录记忆状态。</p></div>}
            {listedWords.map((word) => (<button type="button" key={word.normalized} className={`word-card memory-card-${word.stage}`} onClick={() => openWord(word.display, word.contexts[0] || "", word.documentIds[0] || current.id) }><span className="flex items-center justify-between gap-2"><strong>{word.display}</strong><span className="text-xs">{STAGE_LABELS[word.stage]}</span></span>{word.contexts[0] && <span className="mt-1 line-clamp-2 text-left text-xs leading-5 opacity-65">{word.contexts[0]}</span>}</button>))}
          </div>
          <div className="grid grid-cols-2 gap-2"><button type="button" className="secondary-button justify-center" onClick={copySummary}><ClipboardCopy size={15} /> 复制记录</button><button type="button" className="secondary-button justify-center" onClick={downloadSummary}><Download size={15} /> 导出JSON</button></div>
          <div className="ai-note mt-4"><div className="mb-1 flex items-center gap-1.5 font-bold"><Check size={14} /> AI已接入</div>我可以直接读取点亮词、上下文，以及你选择的答案或“暂时不会”。</div>
        </aside>
      </div>
      {selection && <WordMemoryDialog selection={selection} word={wordMap.get(normalizeWord(selection.display))} busy={memoryBusy} onClose={() => setSelection(null)} onAction={(action) => { void changeWord(selection.display, selection.context, selection.documentId, action); }} />}
    </main>
  );
}
