import tgpu, { d } from "typegpu";
import { ViewParamsType, createRendererShader } from "./shader.ts";

export const WIDTH = 1000;
export const HEIGHT = 800;

export type ViewParams = {
  centerX: number;
  centerY: number;
  scale: number;
  maxIterations: number;
};

export const DEFAULT_VIEW: ViewParams = {
  centerX: -0.5,
  centerY: 0,
  scale: 0.004,
  maxIterations: 256,
};

function splitF64ToF32Pair(value: number): { high: number; low: number } {
  const high = Math.fround(value);
  const low = Math.fround(value - high);
  return { high, low };
}

function buildUniformParams(view: ViewParams) {
  const cx = splitF64ToF32Pair(view.centerX);
  const cy = splitF64ToF32Pair(view.centerY);
  const sc = splitF64ToF32Pair(view.scale);
  return {
    centerXHigh: cx.high,
    centerXLow: cx.low,
    centerYHigh: cy.high,
    centerYLow: cy.low,
    scaleHigh: sc.high,
    scaleLow: sc.low,
    maxIterations: view.maxIterations,
  };
}

export async function initRenderer(
  canvas: HTMLCanvasElement,
): Promise<{ render: (params: ViewParams) => Promise<void>; destroy: () => void }> {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported in this browser.");
  }

  const root = await tgpu.init();

  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    root.destroy();
    throw new Error("Could not obtain WebGPU canvas context.");
  }

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  ctx.configure({
    device: root.device,
    format: "rgba8unorm",
    usage: GPUTextureUsage.COPY_DST,
  });

  const paramsBuffer = root.createUniform(ViewParamsType, buildUniformParams(DEFAULT_VIEW));

  const offscreenTexture = root
    .createTexture({
      size: [WIDTH, HEIGHT],
      format: "rgba8unorm",
    })
    .$usage("storage");

  const storageView = offscreenTexture.createView(d.textureStorage2d("rgba8unorm", "write-only"));

  const layout = tgpu.bindGroupLayout({
    params: { uniform: ViewParamsType },
    outputTex: { storageTexture: d.textureStorage2d("rgba8unorm", "write-only") },
  });

  const bindGroup = root.createBindGroup(layout, {
    params: paramsBuffer.buffer,
    outputTex: storageView,
  });

  const computeShader = createRendererShader(layout, WIDTH, HEIGHT);
  const computePipeline = root.createComputePipeline({ compute: computeShader });

  async function render(params: ViewParams) {
    try {
      paramsBuffer.write(buildUniformParams(params));

      const commandEncoder = root.device.createCommandEncoder();
      const canvasTexture = ctx!.getCurrentTexture();

      computePipeline
        .with(commandEncoder)
        .with(bindGroup)
        .dispatchWorkgroups(Math.ceil(WIDTH / 8), Math.ceil(HEIGHT / 8));

      commandEncoder.copyTextureToTexture(
        { texture: root.unwrap(offscreenTexture) },
        { texture: canvasTexture },
        [WIDTH, HEIGHT],
      );

      root.device.queue.submit([commandEncoder.finish()]);
    } catch (error) {
      console.error("GPU render failed:", error);
      throw error;
    }
  }

  return {
    render,
    destroy: () => root.destroy(),
  };
}
