"use client";

import { BookOpen, Check, CircleHelp, ClipboardCopy, Download, FileUp, Highlighter, Leaf, Plus, Save, Sparkles, X } from "lucide-react";
import { ChangeEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";

type ReadingDocument = { id: string; title: string; body: string; questions: string; createdAt?: number; updatedAt?: number };
type WordRecord = { normalized: string; display: string; clickCount: number; contexts: string[]; documentIds: string[]; lastClickedAt: number };
type ParsedQuestion = { number: number; prompt: string; options: { letter: string; text: string }[] };
type AnswerRecord = { documentId: string; questionNumber: number; selectedOption: string; updatedAt: number };

const sample: ReadingDocument = {
  id: "sample-mars-potato",
  title: "示例：火星土豆",
  body: "An experienced professor started a campaign to prove that a potato was an organism from Mars. He opened an account for research donations and put the potato in charge of the laboratory. Visitors paid one coin, but the potato never gave them change. A reporter cited it as evidence of alien life, so its credit grew across the capital. Then the professor had to confess: the potato's origin was his lunch box. The city faced a civil question—should it cancel the science parade? It kept the parade and renamed it ‘How Humans Turn Lunch into Research.’",
  questions: "1. Why did the professor start the campaign?\nA) To raise money for lunch\nB) To prove the potato came from Mars\nC) To open a bank account\nD) To cancel a parade",
};

function normalizeWord(word: string) {
  return word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

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
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("点击正文、题干或选项里的英文单词，即可点亮并自动保存。");

  const activeWords = useMemo(() => new Set(words.map((word) => word.normalized)), [words]);
  const parsedQuestions = useMemo(() => parseQuestions(current.questions), [current.questions]);
  const answeredCount = parsedQuestions.filter((question) => answers[question.number]).length;

  useEffect(() => {
    Promise.all([fetch("/api/documents").then((response) => response.json()), fetch("/api/words").then((response) => response.json())])
      .then(([documentData, wordData]) => {
        const savedDocuments = documentData.documents ?? [];
        setDocuments(savedDocuments);
        if (savedDocuments.length) setCurrent(savedDocuments[0]);
        setWords(wordData.words ?? []);
      })
      .catch(() => setNotice("暂时无法连接云端，刷新后重试。"));
  }, []);

  useEffect(() => {
    fetch(`/api/answers?documentId=${encodeURIComponent(current.id)}`)
      .then((response) => response.json())
      .then((data) => {
        const next: Record<number, string> = {};
        for (const answer of (data.answers ?? []) as AnswerRecord[]) next[answer.questionNumber] = answer.selectedOption;
        setAnswers(next);
      })
      .catch(() => setNotice("答题记录暂时没有加载成功，点选前请刷新一次。"));
  }, [current.id]);

  async function saveDocument() {
    setBusy(true);
    try {
      const response = await fetch("/api/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(current) });
      const data = await response.json();
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

  async function toggleWord(display: string, context: string) {
    const normalized = normalizeWord(display);
    if (!normalized) return;
    const active = activeWords.has(normalized);
    if (active) setWords((existing) => existing.filter((word) => word.normalized !== normalized));
    else setWords((existing) => [{ normalized, display, clickCount: 1, contexts: [context], documentIds: [current.id], lastClickedAt: Date.now() }, ...existing]);
    try {
      const response = await fetch("/api/words", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: active ? "unmark" : "mark", word: display, context, documentId: current.id }) });
      if (!response.ok) throw new Error();
      setNotice(active ? `已取消 ${display}` : `已点亮 ${display}，继续阅读即可。`);
    } catch {
      setNotice("这次点词没有保存成功，请再点一次。");
      const data = await fetch("/api/words").then((response) => response.json()).catch(() => ({ words: [] }));
      setWords(data.words ?? []);
    }
  }

  async function selectAnswer(questionNumber: number, selectedOption: string) {
    const previous = answers[questionNumber];
    setAnswers((existing) => ({ ...existing, [questionNumber]: selectedOption }));
    setNotice(selectedOption === "?" ? `第${questionNumber}题已记为“暂时不会”。` : `第${questionNumber}题已选择 ${selectedOption}。`);
    try {
      const response = await fetch("/api/answers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: current.id, questionNumber, selectedOption }) });
      if (!response.ok) throw new Error();
    } catch {
      setAnswers((existing) => {
        const next = { ...existing };
        if (previous) next[questionNumber] = previous;
        else delete next[questionNumber];
        return next;
      });
      setNotice("答案没有保存成功，请再选一次。");
    }
  }

  function renderInteractiveText(text: string, fixedContext?: string) {
    const pieces = text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g);
    let offset = 0;
    return pieces.map((piece, index) => {
      const start = offset;
      offset += piece.length;
      if (!/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(piece)) return <span key={`${index}-${start}`}>{piece}</span>;
      const active = activeWords.has(normalizeWord(piece));
      return (
        <button type="button" key={`${index}-${start}`} className={`word-token ${active ? "word-token-active" : ""}`} aria-pressed={active} title={active ? "再次点击可取消标记" : "点击标记为生词"}
          onClick={(event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); toggleWord(piece, fixedContext || sentenceAt(text, start)); }}>
          {piece}
        </button>
      );
    });
  }

  function handleOptionKey(event: KeyboardEvent<HTMLDivElement>, questionNumber: number, letter: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectAnswer(questionNumber, letter);
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
        next = { id: String(parsed.id || crypto.randomUUID()), title: String(parsed.title || file.name.replace(/\.json$/i, "")), body: String(parsed.body || parsed.text || ""), questions: Array.isArray(parsed.questions) ? parsed.questions.join("\n") : String(parsed.questions || "") };
      } catch {
        setNotice("JSON格式无法识别，请检查title、body/text和questions字段。");
        return;
      }
    } else next = { id: crypto.randomUUID(), title: file.name.replace(/\.(txt|md)$/i, ""), body: raw, questions: "" };
    setCurrent(next);
    setAnswers({});
    setShowImport(true);
    event.target.value = "";
  }

  function newImport() {
    setCurrent({ id: crypto.randomUUID(), title: "", body: "", questions: "" });
    setAnswers({});
    setShowImport(true);
  }

  async function copySummary() {
    const lines = words.map((word) => `- ${word.display} ×${word.clickCount}${word.contexts[0] ? `｜${word.contexts[0]}` : ""}`);
    await navigator.clipboard.writeText(`# 本次点词记录\n\n${lines.join("\n") || "暂无生词"}`);
    setNotice("生词记录已复制。");
  }

  function downloadSummary() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), document: current.title, answers, words }, null, 2)], { type: "application/json" });
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
            <label className="secondary-button cursor-pointer"><FileUp size={16} /> <span className="hidden sm:inline">导入文件</span><input type="file" accept=".txt,.md,.json,text/plain,application/json" className="sr-only" onChange={importFile} /></label>
            <button type="button" className="primary-button" onClick={newImport}><Plus size={16} /> <span className="hidden sm:inline">新建导入</span></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] grid-cols-1 gap-4 px-4 py-5 lg:grid-cols-[210px_minmax(0,1fr)_300px] lg:px-7">
        <aside className="paper-panel order-2 p-4 lg:order-1 lg:sticky lg:top-[86px] lg:h-[calc(100vh-106px)]">
          <div className="mb-3 flex items-center justify-between"><h2 className="section-label"><BookOpen size={15} /> 阅读库</h2><span className="count-pill">{documents.length}</span></div>
          <div className="space-y-2 overflow-auto lg:max-h-[calc(100vh-160px)]">
            {documents.length === 0 && <p className="soft-note">还没有保存的材料。可以先体验示例，或导入TXT、MD、JSON。</p>}
            {documents.map((document) => (
              <button type="button" key={document.id} className={`library-item ${current.id === document.id ? "library-item-active" : ""}`} onClick={() => { setAnswers({}); setCurrent(document); setShowImport(false); }}>
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
              <label className="field-label">阅读正文<textarea className="text-area min-h-64" value={current.body} onChange={(event) => setCurrent({ ...current, body: event.target.value })} placeholder="粘贴英文正文，或使用右上角导入TXT/MD/JSON…" /></label>
              <label className="field-label">题目与选项<textarea className="text-area min-h-36" value={current.questions} onChange={(event) => setCurrent({ ...current, questions: event.target.value })} placeholder="格式示例：47. 题干，下一行 A) 选项" /></label>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#718078]">保存后，正文、题干和选项里的英文词都可点击。</p><button type="button" className="primary-button" disabled={busy} onClick={saveDocument}><Save size={16} /> {busy ? "保存中…" : "保存并开始阅读"}</button></div>
            </div>
          ) : (
            <article className="paper-panel overflow-hidden">
              <div className="article-head px-5 py-5 sm:px-9"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">FOCUSED READING</p><h2 className="max-w-3xl text-2xl font-bold sm:text-3xl">{current.title}</h2></div><div className="flex gap-2"><span className="stat-chip">{wordCount(current.body)}词</span><span className="stat-chip stat-chip-amber">{words.length}个生词</span></div></div></div>
              <div className="reading-text px-5 py-8 sm:px-11 sm:py-11">{renderInteractiveText(current.body)}</div>
              {parsedQuestions.length > 0 && (
                <div className="question-zone px-5 py-7 sm:px-9 sm:py-9">
                  <div className="mb-5 flex items-center justify-between gap-3"><div><p className="eyebrow">COMPREHENSION</p><h3 className="text-xl font-bold">阅读题</h3></div><span className="progress-pill">{answeredCount}/{parsedQuestions.length} 已记录</span></div>
                  <div className="space-y-6">
                    {parsedQuestions.map((question) => {
                      const selected = answers[question.number];
                      return (
                        <section className="question-card" key={question.number}>
                          <div className="question-title"><span className="question-number">{question.number}</span><p>{renderInteractiveText(question.prompt, `${question.number}. ${question.prompt}`)}</p></div>
                          {question.options.length > 0 && (
                            <div className="mt-4 grid gap-2.5" role="radiogroup" aria-label={`第${question.number}题选项`}>
                              {question.options.map((option) => {
                                const isSelected = selected === option.letter;
                                const context = `${question.number}. ${question.prompt} ${option.letter}) ${option.text}`;
                                return (
                                  <div key={option.letter} className={`option-card ${isSelected ? "option-card-selected" : ""}`} role="radio" aria-checked={isSelected} tabIndex={0} onClick={() => selectAnswer(question.number, option.letter)} onKeyDown={(event) => handleOptionKey(event, question.number, option.letter)}>
                                    <span className="option-letter">{isSelected ? <Check size={16} /> : option.letter}</span><span className="option-text">{renderInteractiveText(option.text, context)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <button type="button" className={`unsure-button ${selected === "?" ? "unsure-button-selected" : ""}`} onClick={() => selectAnswer(question.number, "?")}><CircleHelp size={16} /> {selected === "?" ? "已记录：暂时不会" : "暂时不会，先记录"}</button>
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

        <aside className="paper-panel order-3 p-4 sm:p-5 lg:sticky lg:top-[86px] lg:h-[calc(100vh-106px)]">
          <div className="mb-3 flex items-center justify-between"><h2 className="section-label"><Highlighter size={15} /> 生词灯</h2><span className="count-pill count-pill-amber">{words.length}</span></div>
          <p className="mb-4 text-sm leading-6 text-[#718078]">正文、题干和选项都能点词。琥珀色只用于生词，避免干扰阅读。</p>
          <div className="mb-4 max-h-[52vh] space-y-2 overflow-auto pr-1">
            {words.length === 0 && <div className="empty-words"><Highlighter size={24} /><p>还没有生词<br />遇到卡顿再点，不必打断阅读。</p></div>}
            {words.map((word) => (<button type="button" key={word.normalized} className="word-card" onClick={() => toggleWord(word.display, word.contexts[0] || "") }><span className="flex items-center justify-between gap-2"><strong>{word.display}</strong><span className="text-xs opacity-55">×{word.clickCount}</span></span>{word.contexts[0] && <span className="mt-1 line-clamp-2 text-left text-xs leading-5 opacity-65">{word.contexts[0]}</span>}</button>))}
          </div>
          <div className="grid grid-cols-2 gap-2"><button type="button" className="secondary-button justify-center" onClick={copySummary}><ClipboardCopy size={15} /> 复制记录</button><button type="button" className="secondary-button justify-center" onClick={downloadSummary}><Download size={15} /> 导出JSON</button></div>
          <div className="ai-note mt-4"><div className="mb-1 flex items-center gap-1.5 font-bold"><Check size={14} /> AI已接入</div>我可以直接读取点亮词、上下文，以及你选择的答案或“暂时不会”。</div>
        </aside>
      </div>
    </main>
  );
}
