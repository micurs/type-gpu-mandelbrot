import "./style.css";
import { initRenderer, DEFAULT_VIEW, WIDTH, HEIGHT } from "./renderer.ts";
import type { ViewParams } from "./renderer.ts";
import { pixelToComplex, computeZoomView } from "./navigation.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>Type-GPU Mandelbrot</h1>
  <canvas id="mandelbrot" width="1000" height="800"></canvas>
  <div id="error"></div>
  <div id="controls">
    <div id="info"></div>
    <div id="iter-controls">
      <button id="iter-down">−</button>
      <span id="iter-value">${DEFAULT_VIEW.maxIterations}</span>
      <button id="iter-up">+</button>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#mandelbrot")!;
const errorDiv = document.querySelector<HTMLDivElement>("#error")!;
const infoDiv = document.querySelector<HTMLDivElement>("#info")!;
const iterValueSpan = document.querySelector<HTMLSpanElement>("#iter-value")!;

let currentView: ViewParams = { ...DEFAULT_VIEW };

function updateInfo(view: ViewParams, renderTimeMs: number) {
  const left = view.centerX - (WIDTH / 2) * view.scale;
  const right = view.centerX + (WIDTH / 2) * view.scale;
  const top = view.centerY - (HEIGHT / 2) * view.scale;
  const bottom = view.centerY + (HEIGHT / 2) * view.scale;
  iterValueSpan.textContent = String(view.maxIterations);
  infoDiv.innerHTML = `
    <span class="info-item">center: ${view.centerX.toFixed(12)}, ${view.centerY.toFixed(12)}</span>
    <span class="info-item">scale: ${view.scale.toExponential(4)}</span>
    <span class="info-item">limits: [${left.toExponential(4)}, ${right.toExponential(4)}] × [${top.toExponential(4)}, ${bottom.toExponential(4)}]</span>
    <span class="info-item">render time: ${renderTimeMs.toFixed(1)} ms</span>
  `;
}

function canvasToComplex(
  clientX: number,
  clientY: number,
  view: ViewParams,
): { cx: number; cy: number } {
  const rect = canvas.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const pixelX = (relX / rect.width) * WIDTH;
  const pixelY = (relY / rect.height) * HEIGHT;
  return pixelToComplex(pixelX, pixelY, WIDTH, HEIGHT, view);
}

async function renderView(view: ViewParams) {
  if (!render) return;
  const start = performance.now();
  try {
    await render(view);
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    errorDiv.textContent = message;
    console.error("GPU render failed:", reason);
  }
  updateInfo(view, performance.now() - start);
}

let render: ((params: ViewParams) => Promise<void>) | null = null;
let animFrameId: number | null = null;
let animTicket = 0;

function animateToCenter(targetCx: number, targetCy: number) {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
  }
  const ticket = ++animTicket;

  const startView: ViewParams = { ...currentView };
  const startTime = performance.now();
  const duration = 500;

  async function frame(now: number) {
    if (ticket !== animTicket) return;

    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - (1 - t) * (1 - t) * (1 - t);

    currentView = {
      ...currentView,
      centerX: startView.centerX + (targetCx - startView.centerX) * eased,
      centerY: startView.centerY + (targetCy - startView.centerY) * eased,
    };

    await renderView(currentView);

    if (ticket !== animTicket) return;

    if (t < 1) {
      animFrameId = requestAnimationFrame(frame);
    } else {
      currentView = { ...currentView, centerX: targetCx, centerY: targetCy };
      animFrameId = null;
    }
  }

  animFrameId = requestAnimationFrame(frame);
}

initRenderer(canvas).then(
  (renderer) => {
    render = renderer.render;
    void renderView(currentView);
  },
  (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    errorDiv.textContent = message;
    console.error("Renderer initialization failed:", reason);
  },
);

canvas.addEventListener("click", (event) => {
  const { cx, cy } = canvasToComplex(event.clientX, event.clientY, currentView);
  animateToCenter(cx, cy);
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  animTicket++;
  currentView = computeZoomView(
    currentView,
    currentView.centerX,
    currentView.centerY,
    event.deltaY < 0,
  );
  void renderView(currentView);
});

document.querySelector<HTMLButtonElement>("#iter-down")!.addEventListener("click", () => {
  currentView = {
    ...currentView,
    maxIterations: Math.max(1, currentView.maxIterations - 50),
  };
  void renderView(currentView);
});

document.querySelector<HTMLButtonElement>("#iter-up")!.addEventListener("click", () => {
  currentView = {
    ...currentView,
    maxIterations: currentView.maxIterations + 50,
  };
  void renderView(currentView);
});
