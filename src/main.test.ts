// @vitest-environment jsdom
import { describe, it, expect } from "vite-plus/test";
import { pixelToComplex, computeZoomView, MIN_SCALE } from "./navigation.ts";
import type { ViewParams } from "./renderer.ts";

const BASE_VIEW: ViewParams = { centerX: -0.5, centerY: 0, scale: 0.004, maxIterations: 256 };

describe("pixelToComplex", () => {
  it("converts center pixel to center coordinates", () => {
    const result = pixelToComplex(500, 400, 1000, 800, BASE_VIEW);
    expect(result.cx).toBe(-0.5);
    expect(result.cy).toBe(0);
  });

  it("converts top-left pixel", () => {
    const result = pixelToComplex(0, 0, 1000, 800, BASE_VIEW);
    expect(result.cx).toBe(-0.5 + -500 * 0.004);
    expect(result.cy).toBe(0 + -400 * 0.004);
  });

  it("converts bottom-right pixel", () => {
    const result = pixelToComplex(1000, 800, 1000, 800, BASE_VIEW);
    expect(result.cx).toBe(-0.5 + 500 * 0.004);
    expect(result.cy).toBe(0 + 400 * 0.004);
  });
});

describe("computeZoomView", () => {
  it("zooms in by 10% on left-click", () => {
    const result = computeZoomView(BASE_VIEW, 0.3, 0.2, true);
    expect(result.centerX).toBe(0.3);
    expect(result.centerY).toBe(0.2);
    expect(result.scale).toBeCloseTo(0.004 * 0.9);
    expect(result.maxIterations).toBe(Math.round(256 * 1.02));
  });

  it("zooms out by 10% on right-click", () => {
    const result = computeZoomView(BASE_VIEW, 0.3, 0.2, false);
    expect(result.centerX).toBe(0.3);
    expect(result.centerY).toBe(0.2);
    expect(result.scale).toBeCloseTo(0.004 / 0.9);
    expect(result.maxIterations).toBe(Math.round(256 / 1.02));
  });

  it("increases maxIterations on zoom-in and decreases on zoom-out", () => {
    const zoomedIn = computeZoomView(BASE_VIEW, 0, 0, true);
    const zoomedOut = computeZoomView(BASE_VIEW, 0, 0, false);
    expect(zoomedIn.maxIterations).toBeGreaterThan(BASE_VIEW.maxIterations);
    expect(zoomedOut.maxIterations).toBeLessThan(BASE_VIEW.maxIterations);
  });

  it("clamps scale to MIN_SCALE on zoom-in", () => {
    const nearLimit: ViewParams = { ...BASE_VIEW, scale: 5e-7 };
    const result = computeZoomView(nearLimit, 0, 0, true);
    expect(result.scale).toBe(MIN_SCALE);
  });
});
