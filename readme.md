# type-gpu-mandelbrot

GPU-accelerated Mandelbrot set renderer built with [TypeGPU](https://typegpu.com).

## Requirements

A browser with [WebGPU](https://gpuweb.github.io/gpuweb/) support (Chrome 113+,
Edge 113+, or recent WebGPU-enabled browsers).

## Getting started

```sh
vp install
vp dev
```

Open the URL printed by the dev server (default `http://localhost:5173`).

## How it works

1. TypeGPU initializes WebGPU and creates an offscreen render texture.
2. A compute shader maps each canvas pixel to a complex-plane coordinate and
   iterates the Mandelbrot equation `z = z² + c` up to a configurable iteration
   limit.
3. Colors are written to the offscreen texture based on escape iteration count.
4. The offscreen texture is copied to the canvas for display.

## Navigation

- **Left-click**: recenter the view on the clicked point.
- **Scroll up**: zoom in by 2%.
- **Scroll down**: zoom out by 2%.

## Scripts

| Command      | Description                         |
| ------------ | ----------------------------------- |
| `vp dev`     | Start development server            |
| `vp build`   | Type-check and build for production |
| `vp check`   | Format, lint, and type-check        |
| `vp test`    | Run tests                           |
| `vp preview` | Preview production build            |

## Release

`0.0.1` — First functional release.
