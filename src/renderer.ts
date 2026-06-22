import tgpu, { d } from "typegpu";
import {
  ViewParamsType,
  OrbitPointType,
  createRendererShader,
  createPerturbationShader,
} from "./shader.ts";
import { makeReferenceOrbit } from "./referenceOrbit.ts";
import type { OrbitPoint } from "./referenceOrbit.ts";

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
  maxIterations: 1024,
};

const PERTURB_THRESHOLD = 1e-7;
const ORBIT_BUF_CAPACITY = 65536;

function splitF64ToF32Pair(value: number): { high: number; low: number } {
  const high = Math.fround(value);
  const low = Math.fround(value - high);
  return { high, low };
}

function buildUniformParams(view: ViewParams, referenceOrbitLen = 0) {
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
    referenceOrbitLen,
  };
}

function orbitPointsToBufferData(orbit: OrbitPoint[], maxIterations: number): Float32Array {
  const data = new Float32Array(maxIterations * 4);
  for (let i = 0; i < orbit.length; i++) {
    data[i * 4 + 0] = orbit[i].re.high;
    data[i * 4 + 1] = orbit[i].re.low;
    data[i * 4 + 2] = orbit[i].im.high;
    data[i * 4 + 3] = orbit[i].im.low;
  }
  return data;
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

  // ── Naive pipeline ────────────────────────────────────────────────────

  const naiveLayout = tgpu.bindGroupLayout({
    params: { uniform: ViewParamsType },
    outputTex: { storageTexture: d.textureStorage2d("rgba8unorm", "write-only") },
  });

  const naiveBindGroup = root.createBindGroup(naiveLayout, {
    params: paramsBuffer.buffer,
    outputTex: storageView,
  });

  const naiveShader = createRendererShader(naiveLayout, WIDTH, HEIGHT);
  const naivePipeline = root.createComputePipeline({ compute: naiveShader });

  // ── Perturbation pipeline ─────────────────────────────────────────────

  const perturbLayout = tgpu.bindGroupLayout({
    params: { uniform: ViewParamsType },
    outputTex: { storageTexture: d.textureStorage2d("rgba8unorm", "write-only") },
    referenceOrbit: { storage: d.arrayOf(OrbitPointType, 0), access: "readonly" },
  });

  const orbitBufferGpu = root.device.createBuffer({
    size: ORBIT_BUF_CAPACITY * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const perturbShader = createPerturbationShader(perturbLayout, WIDTH, HEIGHT);
  const perturbPipeline = root.createComputePipeline({ compute: perturbShader });

  let perturbBindGroup = root.createBindGroup(perturbLayout, {
    params: paramsBuffer.buffer,
    outputTex: storageView,
    referenceOrbit: orbitBufferGpu,
  });

  async function render(params: ViewParams) {
    try {
      let orbitLen = 0;

      if (params.scale < PERTURB_THRESHOLD) {
        const orbit = makeReferenceOrbit(params.centerX, params.centerY, params.maxIterations);
        const bufferData = orbitPointsToBufferData(orbit, params.maxIterations);
        root.device.queue.writeBuffer(orbitBufferGpu, 0, bufferData);
        orbitLen = orbit.length;
      }

      paramsBuffer.write(buildUniformParams(params, orbitLen));

      const commandEncoder = root.device.createCommandEncoder();
      const canvasTexture = ctx!.getCurrentTexture();

      if (params.scale < PERTURB_THRESHOLD) {
        perturbPipeline
          .with(commandEncoder)
          .with(perturbBindGroup)
          .dispatchWorkgroups(Math.ceil(WIDTH / 8), Math.ceil(HEIGHT / 8));
      } else {
        naivePipeline
          .with(commandEncoder)
          .with(naiveBindGroup)
          .dispatchWorkgroups(Math.ceil(WIDTH / 8), Math.ceil(HEIGHT / 8));
      }

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
