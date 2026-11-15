import { expect, it } from "vitest";
// @ts-expect-error reines ESM-Skript ohne Typen
import { erfuellt, version } from "../../scripts/setup.mjs";

it("version liest Mindestangaben mit und ohne Präfix, unlesbar ist null", () => {
  expect(version(">=22.23.4")).toEqual([22, 23, 4]);
  expect(version("v22")).toEqual([22, 0, 0]);
  expect(version("abc")).toBeNull();
  expect(version(undefined)).toBeNull();
});

it("erfuellt vergleicht major, minor, patch; unlesbar ist nein", () => {
  expect(erfuellt("22.23.4", ">=22.23.4")).toBe(true);
  expect(erfuellt("23.0.0", ">=22.23.4")).toBe(true);
  expect(erfuellt("22.23.3", ">=22.23.4")).toBe(false);
  expect(erfuellt("21.99.99", ">=22.23.4")).toBe(false);
  expect(erfuellt("22.23.4", undefined)).toBe(false);
});
