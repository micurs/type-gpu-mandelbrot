import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <h1>Type-GPU demo</h1>
  <canvas id="mandelbrot" width="1000" height="800"></canvas>
`;
