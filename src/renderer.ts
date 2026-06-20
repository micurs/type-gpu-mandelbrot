import tgpu, { d, std, type TgpuBindGroupLayout } from "typegpu";

const WIDTH = 1000;
const HEIGHT = 800;

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

function createRendererShader(layout: TgpuBindGroupLayout) {
  return tgpu
    .computeFn({
      workgroupSize: [8, 8],
      in: { id: d.builtin.globalInvocationId },
    })(({ id }) => {
      "use gpu";

      if (id.x >= 1000 || id.y >= 800) {
        return;
      }

      // @ts-expect-error - resolved to WGSL texture handle inside 'use gpu'
      std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), d.vec4f(1.0, 0.0, 0.0, 1.0));
    })
    .$uses({ layout });
}

export async function initRenderer(canvas: HTMLCanvasElement): Promise<{
  render: () => Promise<void>;
  destroy: () => void;
}> {
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

  const offscreenTexture = root
    .createTexture({
      size: [WIDTH, HEIGHT],
      format: "rgba8unorm",
    })
    .$usage("storage");

  const storageView = offscreenTexture.createView(d.textureStorage2d("rgba8unorm", "write-only"));

  const layout = tgpu.bindGroupLayout({
    outputTex: { storageTexture: d.textureStorage2d("rgba8unorm", "write-only") },
  });

  const bindGroup = root.createBindGroup(layout, {
    outputTex: storageView,
  });

  const computeShader = createRendererShader(layout);
  const computePipeline = root.createComputePipeline({ compute: computeShader });

  async function render() {
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
