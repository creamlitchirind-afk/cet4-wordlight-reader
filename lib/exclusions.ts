export type Evidence = { documentId: string; title: string; start: number; end: number; quote: string; sourceUpdatedAt: number };
export type Exclusion = { documentId: string; questionNumber: number; option: string; excluded: boolean; reason: string; evidence: Evidence[]; updatedAt: number };
export type ExclusionEvent = Omit<Exclusion, "updatedAt"> & { id: string; createdAt: number };
export type ExclusionDraft = Omit<Exclusion, "updatedAt" | "excluded">;
export function sentences(text: string) {
  const result: { start: number; end: number; quote: string }[] = [];
  for (const match of text.matchAll(/[^.!?\n]+(?:[.!?]+|\n|$)/g)) {
    const start = match.index! + match[0].length - match[0].trimStart().length;
    const quote = match[0].trim();
    if (quote) result.push({ start, end: start + quote.length, quote });
  }
  return result;
}
export function evidenceMatches(e: Evidence, source: { id: string; body: string; updatedAt: number }) {
  return e.documentId === source.id && Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 0 && e.end > e.start && e.end <= source.body.length && e.sourceUpdatedAt === source.updatedAt && source.body.slice(e.start, e.end) === e.quote;
}
