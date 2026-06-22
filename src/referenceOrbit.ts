/**
 * CPU-side high-precision reference orbit for GPU perturbation rendering.
 *
 * The reference orbit Z[n] of the view centre is computed at f64 (JS Number)
 * and stored as split f32 DS pairs. The GPU later reads this orbit from a
 * storage buffer and evolves only the small per-pixel delta δz, which stays
 * accurate much longer than a full GPU-side iteration.
 *
 * If the reference escapes before maxIterations the array is truncated at the
 * escape point (the entry with |z|² > 256 is included). The perturbation shader
 * uses orbit.length as the iteration limit; pixels that do not escape within
 * that limit are treated as interior (unreliable).
 */

export type DsPair = { high: number; low: number };

export type OrbitPoint = {
  re: DsPair;
  im: DsPair;
};

/**
 * Split an f64 into two f32 values (high + low) using Math.fround.
 * This gives ~48 bits of mantissa for use in DS shader arithmetic.
 */
export function splitF64ToF32Pair(value: number): DsPair {
  const high = Math.fround(value);
  const low = Math.fround(value - high);
  return { high, low };
}

/**
 * Generate a reference orbit for the given view centre.
 *
 * Iterates the Mandelbrot equation `z₀ = 0; zₙ₊₁ = zₙ² + c` in f64 and
 * returns every step as a DS pair. The escape point (first z with |z|² > 256)
 * is included so that the perturbation shader's escape check fires correctly
 * for neighbouring pixels.
 *
 * @returns Array of orbit points, possibly truncated at the escape point.
 */
export function makeReferenceOrbit(cx: number, cy: number, maxIterations: number): OrbitPoint[] {
  let zx = 0;
  let zy = 0;
  const orbit: OrbitPoint[] = [];

  for (let i = 0; i < maxIterations; i++) {
    orbit.push({
      re: splitF64ToF32Pair(zx),
      im: splitF64ToF32Pair(zy),
    });

    const x2 = zx * zx;
    const y2 = zy * zy;
    if (x2 + y2 > 256.0) {
      return orbit;
    }

    const newZy = 2 * zx * zy + cy;
    zx = x2 - y2 + cx;
    zy = newZy;
  }

  return orbit;
}
