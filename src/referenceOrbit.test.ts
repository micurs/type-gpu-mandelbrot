import { describe, it, expect } from "vite-plus/test";
import { makeReferenceOrbit, splitF64ToF32Pair } from "./referenceOrbit.ts";

describe("splitF64ToF32Pair", () => {
  it("splits zero", () => {
    const { high, low } = splitF64ToF32Pair(0);
    expect(high).toBe(0);
    expect(low).toBe(0);
  });

  it("splits a simple value", () => {
    const { high, low } = splitF64ToF32Pair(1.5);
    expect(high).toBe(Math.fround(1.5));
    expect(low).toBe(Math.fround(1.5 - Math.fround(1.5)));
  });
});

describe("makeReferenceOrbit", () => {
  it("returns orbit with all entries for interior point", () => {
    const orbit = makeReferenceOrbit(0, 0, 100);
    expect(orbit.length).toBe(100);
    expect(orbit[0].re.high).toBe(0);
    expect(orbit[0].im.high).toBe(0);
  });

  it("truncates at escape point for exterior point", () => {
    const orbit = makeReferenceOrbit(2, 0, 1000);
    expect(orbit.length).toBeLessThan(1000);
    // The last entry should have |z|² > 256 (escape point included)
    const last = orbit[orbit.length - 1];
    const magSq = last.re.high * last.re.high + last.im.high * last.im.high;
    expect(magSq).toBeGreaterThan(256);
  });

  it("includes z=0 as first entry", () => {
    const orbit = makeReferenceOrbit(-0.5, 0, 10);
    expect(orbit[0].re.high).toBe(0);
    expect(orbit[0].im.high).toBe(0);
  });

  it("z[1] = c for c = (-0.5, 0)", () => {
    const orbit = makeReferenceOrbit(-0.5, 0, 10);
    expect(orbit[1].re.high).toBeCloseTo(-0.5);
    expect(orbit[1].im.high).toBeCloseTo(0);
  });

  it("center of main cardioid never escapes", () => {
    const orbit = makeReferenceOrbit(-0.5, 0, 10000);
    expect(orbit.length).toBe(10000);
  });

  it("point outside set escapes quickly", () => {
    const orbit = makeReferenceOrbit(2, 0, 10000);
    expect(orbit.length).toBeLessThan(100);
  });
});
