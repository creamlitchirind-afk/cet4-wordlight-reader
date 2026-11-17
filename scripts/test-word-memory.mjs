import assert from "node:assert/strict";
import { ADVANCE_INTERVAL, memoryTransition, isReviewCandidate, pageWordForms } from "../lib/word-memory.ts";

const now = 1800000000000;
let state = {stage: 0, lastAdvancedAt: 0, recallCount: 0, forgetCount: 0};
state = memoryTransition(state, "learned", now);
assert.equal(state.stage, 1);
assert.equal(memoryTransition(state, "remembered", now + ADVANCE_INTERVAL - 1).stage, 1);
for (let day = 1; day <= 3; day++) state = memoryTransition(state, "remembered", now + day * ADVANCE_INTERVAL);
assert.equal(state.stage, 4);
assert.equal(state.recallCount, 3);
state = memoryTransition(state, "forgot", now + 4 * ADVANCE_INTERVAL);
assert.equal(state.stage, 0);
assert.equal(state.forgetCount, 1);
assert.equal(memoryTransition(state, "unmark", now).stage, -1);
// The full page includes every grouped fragment, question and option.
const page = pageWordForms("Pandas wander here. 48. What are mates? A) Genetic diversity. B) Previously conducted research.");
for (const word of ["panda", "wander", "mate", "genetic", "diversity", "conduct", "research"]) {
  assert.equal(isReviewCandidate({normalized: word, stage: 0}, page), false, word);
}
assert.equal(isReviewCandidate({normalized: "campaign", stage: 2}, page), true);
assert.equal(isReviewCandidate({normalized: "campaign", stage: -1}, page), false);
assert.equal(isReviewCandidate({normalized: "campaign", stage: 4}, page), true);
console.log("Memory intervals, forgetting, cancellation and review exclusions passed.");
