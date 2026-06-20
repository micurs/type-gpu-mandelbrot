import tgpu, { d, type TgpuBindGroupLayout } from "typegpu";
import { f32, vec2u, vec4f } from "typegpu/data";
import { textureStore } from "typegpu/std";

const WIDTH = 1000;
const HEIGHT = 800;

const ParamsType = d.struct({
  centerX: d.f32,
  centerY: d.f32,
  scale: d.f32,
  maxIterations: d.u32,
});

export type MandelbrotParams = {
  centerX: number;
  centerY: number;
  scale: number;
  maxIterations: number;
};

export const DEFAULT_PARAMS: MandelbrotParams = {
  centerX: -0.5,
  centerY: 0,
  scale: 0.004,
  maxIterations: 256,
};

function createMandelbrotShader(layout: TgpuBindGroupLayout) {
  return tgpu
    .computeFn({
      workgroupSize: [8, 8],
      in: { id: d.builtin.globalInvocationId },
    })(({ id }) => {
      "use gpu";

      if (id.x >= WIDTH || id.y >= HEIGHT) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = layout.$.params;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o: any = layout.$.outputTex;

      const cx = p.centerX + (f32(id.x) - f32(WIDTH) / 2.0) * p.scale;
      const cy = p.centerY + (f32(id.y) - f32(HEIGHT) / 2.0) * p.scale;

      let zx = 0.0;
      let zy = 0.0;
      let iter = 0;

      for (; iter < p.maxIterations; iter++) {
        const x2 = zx * zx;
        const y2 = zy * zy;
        if (x2 + y2 > 4.0) {
          break;
        }
        zy = 2.0 * zx * zy + cy;
        zx = x2 - y2 + cx;
      }

      if (iter == p.maxIterations) {
        textureStore(o, vec2u(id.x, id.y), vec4f(0.0, 0.0, 0.0, 1.0));
      } else {
        const t = f32(iter) / f32(p.maxIterations);
        const r = 1.0 - t;
        const gVal = (t * 2.0) % 1.0;
        const b = 0.5 + t * 0.5;
        textureStore(o, vec2u(id.x, id.y), vec4f(r, gVal, b, 1.0));
      }
    })
    .$uses({ WIDTH, HEIGHT, f32, vec2u, vec4f, textureStore })
    .$uses({ layout });
}

export async function initRenderer(canvas: HTMLCanvasElement): Promise<{
  render: (params: MandelbrotParams) => Promise<void>;
  destroy: () => void;
}> {
  if (!navigator.gpu) {
    throw new Error(
      "WebGPU is not supported in this browser. " + "Please use a WebGPU-compatible browser.",
    );
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

  const paramsBuffer = root.createUniform(ParamsType, {
    centerX: DEFAULT_PARAMS.centerX,
    centerY: DEFAULT_PARAMS.centerY,
    scale: DEFAULT_PARAMS.scale,
    maxIterations: DEFAULT_PARAMS.maxIterations,
  });

  const offscreenTexture = root
    .createTexture({
      size: [WIDTH, HEIGHT],
      format: "rgba8unorm",
    })
    .$usage("storage");

  const storageView = offscreenTexture.createView(d.textureStorage2d("rgba8unorm", "write-only"));

  const layout = tgpu.bindGroupLayout({
    params: { uniform: ParamsType },
    outputTex: { storageTexture: d.textureStorage2d("rgba8unorm", "write-only") },
  });

  const bindGroup = root.createBindGroup(layout, {
    params: paramsBuffer.buffer,
    outputTex: storageView,
  });

  const computeShader = createMandelbrotShader(layout);
  const computePipeline = root.createComputePipeline({ compute: computeShader });

  async function render(params: MandelbrotParams) {
    paramsBuffer.write({
      centerX: params.centerX,
      centerY: params.centerY,
      scale: params.scale,
      maxIterations: params.maxIterations,
    });

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
  }

  return {
    render,
    destroy: () => root.destroy(),
  };
}
