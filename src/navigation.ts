import type { ViewParams } from "./renderer.ts";

export function pixelToComplex(
  pixelX: number,
  pixelY: number,
  renderWidth: number,
  renderHeight: number,
  view: ViewParams,
): { cx: number; cy: number } {
  return {
    cx: view.centerX + (pixelX - renderWidth / 2) * view.scale,
    cy: view.centerY + (pixelY - renderHeight / 2) * view.scale,
  };
}

export const MIN_SCALE = 5.0e-10;
export const MAX_ITERATIONS = 10000;

export function computeZoomView(
  view: ViewParams,
  clickCx: number,
  clickCy: number,
  zoomIn: boolean,
): ViewParams {
  const rawScale = zoomIn ? view.scale * 0.98 : view.scale / 0.98;
  const scale = zoomIn ? Math.max(rawScale, MIN_SCALE) : rawScale;
  const maxIterations = zoomIn
    ? rawScale >= MIN_SCALE
      ? Math.min(Math.round(view.maxIterations * 1.005), MAX_ITERATIONS)
      : view.maxIterations
    : Math.round(view.maxIterations / 1.005);
  return { ...view, centerX: clickCx, centerY: clickCy, scale, maxIterations };
}
