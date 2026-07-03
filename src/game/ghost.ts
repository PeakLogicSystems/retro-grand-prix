export interface GhostFrame {
  t: number; // seconds since the start of that lap
  x: number;
  y: number;
  angle: number;
}

function lerpAngle(a: number, b: number, t: number): number {
  // Shortest-path interpolation - naively averaging angles near the 0/2pi
  // wrap (e.g. 359 degrees and 1 degree) would swing the wrong way around.
  const diff = (((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}

// Finds the two recorded frames bracketing `t` and blends between them.
// Returns null once the ghost has finished this lap (t past its last frame)
// or if there's nothing recorded yet.
export function sampleGhostAt(frames: GhostFrame[], t: number): { x: number; y: number; angle: number } | null {
  if (frames.length === 0) return null;
  if (t <= frames[0].t) return frames[0];
  if (t >= frames[frames.length - 1].t) return null;

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const frac = (t - a.t) / span;
      return {
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
        angle: lerpAngle(a.angle, b.angle, frac),
      };
    }
  }

  return null;
}
