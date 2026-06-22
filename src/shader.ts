// @ts-nocheck - the 'use gpu' block is WGSL DSL, not TypeScript
import tgpu, { d, std } from "typegpu";
import type { TgpuBindGroupLayout } from "typegpu";

/**
 * View parameters passed as a uniform to every GPU compute shader.
 * Centre coordinates and scale are split into high/low f32 pairs to provide
 * ~48-bit precision for deep-zoom input coordinates.
 */
export const ViewParamsType = d.struct({
  centerXHigh: d.f32,
  centerYHigh: d.f32,
  centerXLow: d.f32,
  centerYLow: d.f32,
  scaleHigh: d.f32,
  scaleLow: d.f32,
  maxIterations: d.u32,
  referenceOrbitLen: d.u32,
});

/**
 * A single point on the reference orbit, stored as double-single (vec2<f32>)
 * pairs to provide ~48-bit precision inside the perturbation shader.
 */
export const OrbitPointType = d.struct({
  re: d.vec2f,
  im: d.vec2f,
});

// Double-single arithmetic helpers (vec2<f32> representing high + low)

/**
 * Promote a scalar f32 into a double-single value with a zero low component.
 * @param a Scalar f32 value to lift.
 * @returns `vec2f(a, 0.0)`.
 */
const ds_lift = (a) => {
  "use gpu";
  return d.vec2f(a, d.f32(0.0));
};

/**
 * Error-free two-term addition (Knuth's algorithm).
 * Given f32 values `a` and `b`, returns `vec2f(s, err)` such that `s + err`
 * equals the exact sum `a + b`, where `s` is the rounded f32 sum and `err`
 * captures the bits lost in rounding. Works for any relative magnitudes.
 * @param a First f32 addend.
 * @param b Second f32 addend.
 * @returns `vec2f` whose components recombine to the exact sum.
 */
const two_sum = (a, b) => {
  "use gpu";
  const s = a + b;
  const bb = s - a;
  const err = a - (s - bb) + (b - bb);
  return d.vec2f(s, err);
};

/**
 * Renormalizing two-term sum, assuming `|a| >= |b|`.
 * Faster than `two_sum` but requires the magnitude precondition; otherwise the
 * error term may underflow and precision is lost. Returns `vec2f(s, err)` so
 * that `s + err == a + b` exactly.
 * @param a Larger-magnitude f32 addend.
 * @param b Smaller-magnitude f32 addend.
 * @returns `vec2f` whose components recombine to the exact sum.
 */
const quick_two_sum = (a, b) => {
  "use gpu";
  const s = a + b;
  const err = b - (s - a);
  return d.vec2f(s, err);
};

/**
 * Double-single addition: compute `(a + b)` as a normalized `vec2f`.
 * Uses `two_sum` on the high components, accumulates the low components into
 * the residual, and renormalizes the result via `quick_two_sum`.
 * @param a First double-single operand (`vec2f`).
 * @param b Second double-single operand (`vec2f`).
 * @returns `vec2f` representing the exact sum with normalized components.
 */
const ds_add = (a, b) => {
  "use gpu";
  const s = two_sum(a.x, b.x);
  const v = s.y + a.y;
  const w = v + b.y;
  return quick_two_sum(s.x, w);
};

/**
 * Double-single subtraction, defined as `a + (-b)`.
 * @param a Minuend double-single operand (`vec2f`).
 * @param b Subtrahend double-single operand (`vec2f`).
 * @returns `vec2f` representing `a - b` with normalized components.
 */
const ds_sub = (a, b) => {
  "use gpu";
  return ds_add(a, d.vec2f(-b.x, -b.y));
};

/**
 * Veltkamp split: decompose an f32 into high and low 12-bit halves.
 * Uses the constant `2^12 + 1 = 4097` to split the 24-bit f32 mantissa into two
 * non-overlapping 12-bit parts, so that `high + low == x` exactly and each
 * part has at most 12 significand bits. Used by Dekker's multiplication
 * algorithm to compute the exact product residual in plain f32 arithmetic,
 * without depending on a hardware-fused `fma`.
 * @param x Scalar f32 value to split.
 * @returns `vec2f(high, low)` where `high + low == x` exactly.
 */
const split = (x) => {
  "use gpu";
  const c = d.f32(4097.0);
  const t = x * c;
  const high = t - (t - x);
  const low = x - high;
  return d.vec2f(high, low);
};

/**
 * Double-single multiplication (Dekker's algorithm with Veltkamp split).
 * Computes the exact high product `a.x * b.x` via split halves, then adds the
 * cross terms involving `a.y` and `b.y`. The result is renormalized via
 * `quick_two_sum`. Does NOT rely on `std.fma`, so it stays exact even on GPUs
 * that implement `fma` as two rounded operations.
 * @param a First double-single operand (`vec2f`).
 * @param b Second double-single operand (`vec2f`).
 * @returns `vec2f` representing the product with normalized components.
 */
const ds_mul = (a, b) => {
  "use gpu";
  const aS = split(a.x);
  const bS = split(b.x);
  const p = a.x * b.x;
  const r = aS.x * bS.x - p + aS.x * bS.y + aS.y * bS.x;
  const err = r + a.x * b.y + a.y * b.x + a.y * b.y;
  return quick_two_sum(p, err);
};

/**
 * Exact multiply-by-2 for a double-single value.
 * Multiplying by 2 is exact in f32 (just an exponent bump), so both components
 * can be scaled independently without renormalization. Cheaper and more
 * accurate than routing through `ds_mul(ds_lift(2.0), a)`.
 * @param a Double-single operand (`vec2f`).
 * @returns `vec2f` representing `2 * a`.
 */
const ds_scale2 = (a) => {
  "use gpu";
  return d.vec2f(a.x * d.f32(2.0), a.y * d.f32(2.0));
};

/**
 * Compute the smooth-iteration escape color for a Mandelbrot pixel.
 *
 * Combines the integer iteration count with a fractional correction derived
 * from the final |z|² magnitude to produce a continuous (non-banded) coloring.
 * The hue is generated by cosine-offset RGB channels. The magnitude is
 * recombined from its double-single parts before the scalar `log` calls.
 *
 * @param x2 Double-single `zx²` from the last iteration (`vec2f`).
 * @param y2 Double-single `zy²` from the last iteration (`vec2f`).
 * @param iter Integer escape count (`u32`).
 * @returns `vec4f(r, g, b, 1.0)` color in `rgba8unorm` range.
 */
const normalizedIterationColor = (x2, y2, iter) => {
  "use gpu";
  const mag = ds_add(x2, y2);
  const log_zn = std.log(mag.x + mag.y) * 0.5;
  const nu = std.log(log_zn / std.log(2.0)) / std.log(2.0);
  const smooth_iter = d.f32(iter) + 1.0 - nu;
  const t = smooth_iter / d.f32(16.0);
  const r = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t + d.f32(0.0)));
  const g = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t + d.f32(0.33)));
  const b = d.f32(0.5) + d.f32(0.5) * std.cos(d.f32(6.28318) * (t + d.f32(0.67)));
  return d.vec4f(r, g, b, 1.0);
};

/**
 * Build the Mandelbrot compute shader for the given canvas dimensions.
 *
 * The shader maps each pixel to a complex-plane coordinate `c` and iterates
 * `z = z² + c` using double-single arithmetic (`vec2<f32>` high+low) for
 * extended precision. Inputs (center coords and scale) arrive as pre-split
 * high/low f32 pairs in the uniform so the shader can reconstruct ~48-bit
 * double-single centers directly. The escape check and color output remain
 * scalar f32.
 *
 * @param layout Bind group layout providing `params` (uniform) and
 *              `outputTex` (write-only storage texture).
 * @param w Canvas width in pixels (dispatch is clipped to this).
 * @param h Canvas height in pixels (dispatch is clipped to this).
 * @returns A TypeGPU compute function ready to be wired into a pipeline.
 */
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

      const center_x = d.vec2f(layout.$.params.centerXHigh, layout.$.params.centerXLow);
      const center_y = d.vec2f(layout.$.params.centerYHigh, layout.$.params.centerYLow);
      const scale = d.vec2f(layout.$.params.scaleHigh, layout.$.params.scaleLow);
      const shift_x = d.f32(id.x) - d.f32(w) / 2.0;
      const shift_y = d.f32(id.y) - d.f32(h) / 2.0;
      const cx = ds_add(center_x, ds_mul(ds_lift(shift_x), scale));
      const cy = ds_add(center_y, ds_mul(ds_lift(shift_y), scale));

      let zx = ds_lift(0.0);
      let zy = ds_lift(0.0);
      let iter = d.u32(0);
      let x2 = ds_lift(0.0);
      let y2 = ds_lift(0.0);

      for (; iter < layout.$.params.maxIterations; iter++) {
        x2 = ds_mul(zx, zx);
        y2 = ds_mul(zy, zy);
        const magSq = ds_add(x2, y2);
        if (magSq.x + magSq.y > d.f32(256.0)) {
          break;
        }
        zy = ds_add(ds_scale2(ds_mul(zx, zy)), cy);
        zx = ds_add(ds_sub(x2, y2), cx);
      }

      if (iter === layout.$.params.maxIterations) {
        std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), d.vec4f(0.0, 0.0, 0.0, 1.0));
        return;
      }

      const color = normalizedIterationColor(x2, y2, iter);
      std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), color);
    })
    .$uses({ w, h, layout });
}

// ── Double-single complex arithmetic ────────────────────────────────────

/**
 * Real component of double-single complex multiplication.
 * `(a_re + a_im·i) * (b_re + b_im·i) = (a_re·b_re − a_im·b_im) + …·i`
 * Each term is a full DS × DS product via Dekker, so the result mantissa
 * stays accurate to ~48 bits.
 */
const ds_cmul_re = (a_re, a_im, b_re, b_im) => {
  "use gpu";
  return ds_sub(ds_mul(a_re, b_re), ds_mul(a_im, b_im));
};

/**
 * Imaginary component of double-single complex multiplication.
 * `(a_re + a_im·i) * (b_re + b_im·i) = … + (a_re·b_im + a_im·b_re)·i`
 */
const ds_cmul_im = (a_re, a_im, b_re, b_im) => {
  "use gpu";
  return ds_add(ds_mul(a_re, b_im), ds_mul(a_im, b_re));
};

// ── Perturbation kernel ─────────────────────────────────────────────────

/**
 * Build a perturbation-theory Mandelbrot compute shader.
 *
 * Instead of iterating every pixel from z₀ = 0 (the naive approach), the
 * shader reads a pre-computed reference orbit Z[n] from a storage buffer.
 * Each pixel iterates only the small delta δz:
 *
 *   δz₀   = 0
 *   δzₙ₊₁ = 2·Zₙ·δzₙ + δzₙ² + δc
 *
 * where δc = cₚᵢₓₑₗ − c_ref.  Because δz stays small (≪ |Z|) for
 * deep-zoom views the iteration remains accurate long after naive f32
 * arithmetic would have been destroyed by catastrophic cancellation.
 *
 * The real pixel value zₙ = Zₙ + δzₙ is reconstructed on the fly for the
 * escape check and the final smooth colour.
 *
 * @param layout  Bind-group layout providing `params` (uniform),
 *                `outputTex` (write-only storage texture), and
 *                `referenceOrbit` (read-only storage buffer).
 * @param w       Texture width (dispatch is clipped here).
 * @param h       Texture height (dispatch is clipped here).
 * @returns A TypeGPU compute function wired to the given layout.
 */
export function createPerturbationShader(layout: TgpuBindGroupLayout, w: number, h: number) {
  return tgpu
    .computeFn({
      workgroupSize: [8, 8],
      in: { id: d.builtin.globalInvocationId },
    })(({ id }) => {
      "use gpu";

      if (id.x >= w || id.y >= h) {
        return;
      }

      const center_x = d.vec2f(layout.$.params.centerXHigh, layout.$.params.centerXLow);
      const center_y = d.vec2f(layout.$.params.centerYHigh, layout.$.params.centerYLow);
      const scale = d.vec2f(layout.$.params.scaleHigh, layout.$.params.scaleLow);
      const shift_x = d.f32(id.x) - d.f32(w) / d.f32(2.0);
      const shift_y = d.f32(id.y) - d.f32(h) / d.f32(2.0);

      // δc = cₚᵢₓₑₗ − c_ref = shift × scale
      const delta_cx = ds_mul(ds_lift(shift_x), scale);
      const delta_cy = ds_mul(ds_lift(shift_y), scale);
      const cx_pixel = ds_add(center_x, delta_cx);
      const cy_pixel = ds_add(center_y, delta_cy);

      let delta_re = ds_lift(0.0);
      let delta_im = ds_lift(0.0);
      let iter = d.u32(0);
      let x2 = ds_lift(0.0);
      let y2 = ds_lift(0.0);

      const orbit_limit = std.min(layout.$.params.maxIterations, layout.$.params.referenceOrbitLen);

      // Running z for naive fallback. During perturbation, we track the
      // full z = Z[n] + δz[n] so we can seamlessly continue naively once the
      // reference orbit runs out.
      let z_re = ds_lift(0.0);
      let z_im = ds_lift(0.0);

      for (; iter < layout.$.params.maxIterations; iter++) {
        if (iter < orbit_limit) {
          // Perturbation: z = Z[n] + δz[n]
          const ref_re = layout.$.referenceOrbit[iter].re;
          const ref_im = layout.$.referenceOrbit[iter].im;
          z_re = d.vec2f(ds_add(ref_re, delta_re));
          z_im = d.vec2f(ds_add(ref_im, delta_im));
        }

        // escape check with full high-precision |z|
        x2 = ds_mul(z_re, z_re);
        y2 = ds_mul(z_im, z_im);
        const magSq = ds_add(x2, y2);
        if (magSq.x + magSq.y > d.f32(256.0)) {
          break;
        }

        // Compute next z: z_next = z² + c_pixel
        const next_im = ds_add(ds_scale2(ds_mul(z_re, z_im)), cy_pixel);
        const next_re = ds_add(ds_sub(x2, y2), cx_pixel);

        if (iter < orbit_limit) {
          // Perturbation: also update δz
          const ref_re = layout.$.referenceOrbit[iter].re;
          const ref_im = layout.$.referenceOrbit[iter].im;
          const z_delta_re = ds_cmul_re(ref_re, ref_im, delta_re, delta_im);
          const z_delta_im = ds_cmul_im(ref_re, ref_im, delta_re, delta_im);
          const delta_sq_re = ds_cmul_re(delta_re, delta_im, delta_re, delta_im);
          const delta_sq_im = ds_cmul_im(delta_re, delta_im, delta_re, delta_im);
          delta_re = d.vec2f(ds_add(ds_scale2(z_delta_re), ds_add(delta_sq_re, delta_cx)));
          delta_im = d.vec2f(ds_add(ds_scale2(z_delta_im), ds_add(delta_sq_im, delta_cy)));
        }

        z_re = d.vec2f(next_re);
        z_im = d.vec2f(next_im);
      }

      if (iter === layout.$.params.maxIterations) {
        std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), d.vec4f(0.0, 0.0, 0.0, 1.0));
        return;
      }

      const color = normalizedIterationColor(x2, y2, iter);
      std.textureStore(layout.$.outputTex, d.vec2u(id.x, id.y), color);
    })
    .$uses({ w, h, layout });
}
