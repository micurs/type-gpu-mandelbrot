// @ts-nocheck - the 'use gpu' block is WGSL DSL, not TypeScript
import tgpu, { d, std } from "typegpu";
import type { TgpuBindGroupLayout } from "typegpu";

export const ViewParamsType = d.struct({
  centerX: d.f32,
  centerY: d.f32,
  scale: d.f32,
  maxIterations: d.u32,
});

export function createRendererShader(layout: TgpuBindGroupLayout, w: number, h: number) {
  return tgpu.computeFn({
    workgroupSize: [8, 8],
    in: { id: d.builtin.globalInvocationId },
  })(({ id }) => {
    "use gpu";

    if (id.x >= w || id.y >= h) {
      return;
    }

    const cx = layout.$.params.centerX + (d.f32(id.x) - d.f32(w) / 2.0) * layout.$.params.scale;
    const cy = layout.$.params.centerY + (d.f32(id.y) - d.f32(h) / 2.0) * layout.$.params.scale;

    let zx = d.f32(0.0);
    let zy = d.f32(0.0);
    let iter = d.u32(0);
    let x2 = d.f32(0.0);
    let y2 = d.f32(0.0);

    for (; iter < layout.$.params.maxIterations; iter++) {
      x2 = zx * zx;
      y2 = zy * zy;
      if (x2 + y2 > d.f32(256.0)) {
        break;
      }
      zy = d.f32(2.0) * zx * zy + cy;
      zx = x2 - y2 + cx;
    }

    if (iter === layout.$.params.maxIterations) {
      std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), d.vec4f(0.0, 0.0, 0.0, 1.0));
      return;
    }

    const log_zn = std.log(x2 + y2) * 0.5;
    const nu = std.log(log_zn / std.log(2.0)) / std.log(2.0);
    const smooth_iter = d.f32(iter) + 1.0 - nu;
    const t = smooth_iter / d.f32(16.0);
    const r = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t + d.f32(0.0)));
    const g = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t + d.f32(0.33)));
    const b = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t + d.f32(0.67)));
    std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), d.vec4f(r, g, b, 1.0));
  });
}
