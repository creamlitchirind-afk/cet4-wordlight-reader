"use client";
import { useEffect, useRef } from "react";
import type { ExclusionDraft } from "@/lib/exclusions";
export function ExclusionEditor({ draft, active, busy, error, onChange, onClose, onPick, onSave }: {
  draft: ExclusionDraft; active: boolean; busy: boolean; error: string;
  onChange: (draft: ExclusionDraft) => void; onClose: () => void; onPick: () => void; onSave: (excluded: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; const previous = document.activeElement as HTMLElement; el?.showModal(); return () => { el?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="memory-dialog" aria-labelledby="exclusion-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="flex justify-between gap-3"><div><p className="eyebrow">MY REASONING</p><h2 id="exclusion-title" className="text-xl font-bold">第{draft.questionNumber}题 · 排除 {draft.option}</h2></div><button disabled={busy} className="secondary-button" onClick={onClose}>取消编辑</button></div>
    <p className="my-3 text-sm leading-6">可以写理由，也可以去原文选句，两者都能保存。这是你的判断，不代表标准答案。</p>
    <label className="field-label">我的排除理由（选填）<textarea className="text-area min-h-24" maxLength={2000} value={draft.reason} disabled={busy} onChange={e => onChange({ ...draft, reason: e.target.value })} placeholder="例如：原文只是说可能，选项却说一定……" /></label>
    <button className="secondary-button" disabled={busy} onClick={onPick}>跳到原文选句</button>
    <div className="my-3 space-y-2">{draft.evidence.map((e, i) => <div key={`${e.documentId}:${e.start}`} className="memory-context"><p>{e.quote}</p><p className="mt-2 text-xs">{e.title} · 原句快照</p><button className="secondary-button mt-2" disabled={busy} onClick={() => onChange({ ...draft, evidence: draft.evidence.filter((_, j) => j !== i) })}>移除这句</button></div>)}</div>
    {error && <p role="alert" className="my-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className="primary-button" disabled={busy} onClick={() => onSave(true)}>{busy ? "保存中…" : active ? "保存排除理由" : "确认排除"}</button>{active && <button className="secondary-button" disabled={busy} onClick={() => onSave(false)}>撤销排除（保留历史）</button>}</div>
    <p className="mt-3 text-xs text-[#637067]">点“确认排除”才保存；暂时不写理由也可以。撤销不自动选中该选项。</p>
  </dialog>;
}
