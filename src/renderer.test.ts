// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vite-plus/test";
import { initRenderer } from "./renderer.ts";

describe("initRenderer", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <canvas id="mandelbrot" width="1000" height="800"></canvas>
        <div id="error"></div>
      </div>
    `;
  });

  it("throws when WebGPU is unavailable", async () => {
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    });

    const canvas = document.querySelector<HTMLCanvasElement>("#mandelbrot")!;
    const errorDiv = document.querySelector<HTMLDivElement>("#error")!;

    try {
      await initRenderer(canvas);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason);
      errorDiv.textContent = message;
    }

    expect(errorDiv.textContent).toBe("WebGPU is not supported in this browser.");
  });
});
