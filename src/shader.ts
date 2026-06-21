// @ts-nocheck
import tgpu, { d, std } from "typegpu";
import type { TgpuBindGroupLayout } from "typegpu";

export const ViewParamsType = d.struct({
  centerX: d.f32,
  centerY: d.f32,
  scale: d.f32,
  maxIterations: d.u32,
});

export function createRendererShader(layout: TgpuBindGroupLayout, w: number, h: number) {
  return tgpu
    .computeFn({
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
      let iter = 0;

      for (; iter < layout.$.params.maxIterations; iter++) {
        const x2 = zx * zx;
        const y2 = zy * zy;
        if (x2 + y2 > 4.0) {
          break;
        }
        zy = d.f32(2.0) * zx * zy + cy;
        zx = x2 - y2 + cx;
      }

      const t = d.f32(iter) / d.f32(layout.$.params.maxIterations);
      const r = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t * d.f32(4.0) + d.f32(0.0)));
      const g = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t * d.f32(4.0) + d.f32(0.33)));
      const b = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t * d.f32(4.0) + d.f32(0.67)));
      const color = std.select(
        d.vec4f(r, g, b, 1.0),
        d.vec4f(0.0, 0.0, 0.0, 1.0),
        iter === layout.$.params.maxIterations,
      );
      std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), color);
    })
    .$uses({ w, h, layout });
}
