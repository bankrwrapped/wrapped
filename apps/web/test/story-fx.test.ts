// The story's effects tier: a fast device keeps the full look, a device that
// drops frames in the first seconds of playback switches to lite, and lite
// sticks once it's on. The tier lives in module state, so the order matters:
// the fast cases run first, while it is still "full".
import { test, expect } from "bun:test";
import { createFrameSampler, getFx } from "../src/components/wrapped/story/fx";

const feed = (sample: (dt: number) => void, frames: number[]) => frames.forEach(sample);
const repeat = (dt: number, ms: number) => Array.from({ length: Math.ceil(ms / dt) }, () => dt);

test("starts on full when there's no window to inspect", () => {
  expect(getFx()).toBe("full");
});

test("a 60fps device keeps full effects", () => {
  feed(createFrameSampler(), repeat(16.7, 5000));
  expect(getFx()).toBe("full");
});

test("occasional hitches (scene changes) don't trip it", () => {
  // 60fps with a 120ms hitch every half second, about 3% of frames.
  const frames = repeat(16.7, 5000).map((dt, i) => (i % 30 === 29 ? 120 : dt));
  feed(createFrameSampler(), frames);
  expect(getFx()).toBe("full");
});

test("a slow warm-up alone doesn't count", () => {
  feed(createFrameSampler(), [...repeat(50, 800), ...repeat(16.7, 3000)]);
  expect(getFx()).toBe("full");
});

test("a device stuck under ~35fps switches to lite", () => {
  feed(createFrameSampler(), repeat(33, 4000));
  expect(getFx()).toBe("lite");
});

test("lite sticks: a later smooth run doesn't switch back", () => {
  feed(createFrameSampler(), repeat(16.7, 5000));
  expect(getFx()).toBe("lite");
});
