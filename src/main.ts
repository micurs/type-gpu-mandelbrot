import "./style.css";
import { initRenderer, DEFAULT_VIEW } from "./renderer.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>Type-GPU Mandelbrot</h1>
  <canvas id="mandelbrot" width="1000" height="800"></canvas>
  <div id="error"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#mandelbrot")!;
const errorDiv = document.querySelector<HTMLDivElement>("#error")!;

void initRenderer(canvas).then(
  ({ render }) => {
    void render(DEFAULT_VIEW);
  },
  (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    errorDiv.textContent = message;
    console.error("Renderer initialization failed:", reason);
  },
);
