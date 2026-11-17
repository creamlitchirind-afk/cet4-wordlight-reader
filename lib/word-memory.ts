export type WordAction = "mark" | "learned" | "remembered" | "forgot" | "unmark";
export const STAGE_LABELS: Record<number, string> = {
  [-1]: "已取消标记", 0: "不认识 / 又忘了", 1: "刚弄懂", 2: "回忆一次", 3: "逐渐熟悉", 4: "暂时掌握",
};
export const ADVANCE_INTERVAL = 24 * 60 * 60 * 1000;
export function memoryTransition(previous: { stage: number; lastAdvancedAt: number; recallCount: number; forgetCount: number }, action: WordAction, now: number) {
  const next = { ...previous };
  if (action === "unmark") next.stage = -1;
  if (action === "mark") { if (previous.stage < 0) next.stage = 0; }
  if (action === "forgot") { next.stage = 0; next.lastAdvancedAt = now; next.forgetCount++; }
  if (action === "learned" && previous.stage <= 0) { next.stage = 1; next.lastAdvancedAt = now; }
  if (action === "remembered") {
    next.recallCount++;
    if (previous.stage <= 0) { next.stage = 1; next.lastAdvancedAt = now; }
    else if (previous.stage < 4 && now - previous.lastAdvancedAt >= ADVANCE_INTERVAL) { next.stage++; next.lastAdvancedAt = now; }
  }
  return next;
}

export function normalizeWord(word: string) {
  return word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

// Conservative overlap filtering: exact forms, possessives and common inflections.
// Extra exclusions are preferable to showing a current-page word in the review card.
export function wordForms(word: string) {
  const base = normalizeWord(word).replace(/[’']s$/, "").replace(/[’']$/, "");
  const forms = new Set([base]);
  if (base.length > 3 && base.endsWith("s")) forms.add(base.slice(0, -1));
  if (base.endsWith("ies")) forms.add(base.slice(0, -3) + "y");
  if (base.endsWith("es")) forms.add(base.slice(0, -2));
  for (const suffix of ["ing", "ed"]) {
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      const stem = base.slice(0, -suffix.length);
      forms.add(stem); forms.add(stem + "e");
      if (/(.)\1$/.test(stem)) forms.add(stem.slice(0, -1));
    }
  }
  return forms;
}

export function pageWordForms(text: string) {
  return new Set((text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).flatMap((word) => [...wordForms(word)]));
}

export function isReviewCandidate(word: { normalized: string; stage: number }, pageForms: Set<string>) {
  return word.stage >= 0 && ![...wordForms(word.normalized)].some((form) => pageForms.has(form));
}
