"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_LABELS, type WordAction } from "@/lib/word-memory";

export type MemoryWord = { normalized: string; display: string; stage: number; contexts: string[]; documentIds: string[]; recallCount: number; forgetCount: number };
export type WordSelection = { display: string; context: string; documentId: string };
type ActionsProps = { disabled: boolean; onAction: (action: WordAction) => void };

function MemoryActions({ disabled, onAction }: ActionsProps) {
  return <div className="memory-actions">
    <button disabled={disabled} onClick={() => onAction("learned")} type="button">我弄懂了<span>深蓝 · 开始巩固</span></button>
    <button disabled={disabled} onClick={() => onAction("remembered")} type="button">这次记住了<span>记录一次独立回忆</span></button>
    <button disabled={disabled} onClick={() => onAction("forgot")} type="button">又忘了 / 不认识<span>琥珀 · 再复习</span></button>
  </div>;
}

export function WordMemoryDialog({ selection, word, busy, onClose, onAction }: {
  selection: WordSelection; word?: MemoryWord; busy: boolean; onClose: () => void; onAction: (action: WordAction) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<{ id: string; action: string; fromStage: number; toStage: number; createdAt: number }[]>([]);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/words?word=${encodeURIComponent(selection.display)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data) => { setHistory((data as { history?: typeof history }).history ?? []); setHistoryError(false); })
      .catch(() => { if (!controller.signal.aborted) setHistoryError(true); });
    return () => controller.abort();
  }, [selection.display, word]);
  const labels: Record<string, string> = { mark: "点亮", learned: "弄懂了", remembered: "记住了", forgot: "又忘了", unmark: "误点取消" };
  return <dialog ref={dialog} className="memory-dialog" aria-labelledby="word-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">WORD MEMORY</p><h2 id="word-dialog-title" className="text-2xl font-bold">{selection.display}</h2></div><button className="secondary-button" type="button" onClick={onClose}>关闭</button></div>
    <p className="my-3 text-sm">{word ? STAGE_LABELS[word.stage] : "未标记"} · 回忆 {word?.recallCount ?? 0} 次 · 遗忘 {word?.forgetCount ?? 0} 次</p>
    {selection.context && <p className="memory-context">{selection.context}</p>}
    <MemoryActions disabled={busy} onAction={onAction} />
    <p className="my-3 text-xs leading-5 text-[#637067]">蓝色至少间隔24小时成功回忆才变浅。同一天的回忆照常记录；无色后若又忘了，可重新标黄。</p>
    <button type="button" className="secondary-button" disabled={busy} onClick={() => onAction("unmark")}>刚才误点了，取消标记</button>
    <details className="mt-4 text-sm"><summary>查看记忆记录</summary>
      {historyError ? <p>暂时无法读取历史，请稍后重新打开。</p> : history.length ? <ul className="mt-2 max-h-40 overflow-auto space-y-2">{history.map((event) => <li key={event.id}>{new Date(event.createdAt).toLocaleString("zh-CN")} · {labels[event.action] ?? event.action} · {STAGE_LABELS[event.toStage]}</li>)}</ul> : <p className="mt-2">暂无新记录，旧版点词不会被当成已经掌握。</p>}
    </details>
  </dialog>;
}

export function ReviewBreak({ candidates, busy, onAction }: {
  candidates: MemoryWord[]; busy: boolean;
  onAction: (word: MemoryWord, action: WordAction) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const word = candidates.find((candidate) => candidate.normalized === picked);
  function choose() {
    const other = candidates.filter((candidate) => candidate.normalized !== picked);
    const pool = other.length ? other : candidates;
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    setPicked(pool.length ? pool[random[0] % pool.length].normalized : "");
    setRevealed(false); setRecorded(false);
  }
  return <section className="review-break">
    <button type="button" className="review-break-toggle" aria-expanded={open} aria-controls="review-break-content" onClick={() => { if (!open) choose(); setOpen(!open); }}>☕ 换换脑子 · 复习一个旧词 <span>{open ? "收起" : "展开"}</span></button>
    {open && <div id="review-break-content" className="pt-3">
      <p className="text-xs leading-5 text-[#637067]">避开当前正文、题干和选项。先回忆词义，需要时再看原句。</p>
      {!candidates.length ? <p className="my-3 text-sm">暂时没有本页以外的历史词。继续阅读，积累后这里就能抽词。</p> : !word ? <div className="mt-3"><p className="text-sm">页面内容已更新，请重新抽一个词。</p><button type="button" className="secondary-button mt-2" onClick={choose}>抽一个词</button></div> : <>
        <p className="review-word">{word.display}</p>
        {!revealed ? <button type="button" className="secondary-button" onClick={() => setRevealed(true)}>看历史原句</button> : <p className="memory-context">{word.contexts[0] || "这个词尚未保存原句，可以在会话中让我帮你复习。"}</p>}
        {recorded ? <p role="status" className="my-3 text-sm text-[#365f4c]">已记录这次回忆。可以换一个词，或回到阅读。</p> : <div className="memory-actions mt-3">
          <button type="button" disabled={busy} onClick={async () => { if (await onAction(word, "remembered")) setRecorded(true); }}>这次记住了</button>
          <button type="button" disabled={busy} onClick={async () => { if (await onAction(word, "forgot")) setRecorded(true); }}>又忘了</button>
        </div>}
        <button type="button" disabled={busy} className="secondary-button mt-3" onClick={choose}>换一个词</button>
      </>}
    </div>}
  </section>;
}
