import type { TrackDefinition } from './track';

// Derives the bottom straight's extent from the track data itself (rather
// than hardcoding coordinates) so this stays correct if the track shape
// ever changes.
function getBottomStraight(track: TrackDefinition): { xStart: number; xEnd: number; y: number } {
  const pts = track.centerline;
  const y = Math.max(...pts.map((p) => p.y));
  const xsOnBottom = pts.filter((p) => Math.abs(p.y - y) < 0.5).map((p) => p.x);
  return { xStart: Math.min(...xsOnBottom), xEnd: Math.max(...xsOnBottom), y };
}

const CROWD_COLORS = ['#f2c14e', '#f25c5c', '#5cc2f2', '#8ef25c', '#f2f2f2', '#c78ef2'];

// Purely decorative - doesn't yet block the car (that would be a separate
// collision feature). Crowd dots use a seeded pseudo-random sequence reset
// on every call so the pattern is fixed instead of flickering each frame.
export function renderBottomGrandstand(ctx: CanvasRenderingContext2D, track: TrackDefinition): void {
  const { xStart, xEnd, y } = getBottomStraight(track);
  const outerEdge = y + track.width / 2;

  const railY = outerEdge + 14;
  const standTop = railY + 10;
  const standHeight = 40;

  // Guardrail with posts
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(xStart, railY);
  ctx.lineTo(xEnd, railY);
  ctx.stroke();

  ctx.strokeStyle = '#999';
  ctx.lineWidth = 3;
  for (let x = xStart; x <= xEnd; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, railY - 6);
    ctx.lineTo(x, railY + 6);
    ctx.stroke();
  }

  // Grandstand structure
  ctx.fillStyle = '#555';
  ctx.fillRect(xStart, standTop, xEnd - xStart, standHeight);
  ctx.fillStyle = '#333';
  ctx.fillRect(xStart - 4, standTop - 8, xEnd - xStart + 8, 8);

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let rowY = standTop + 10; rowY < standTop + standHeight; rowY += 10) {
    ctx.beginPath();
    ctx.moveTo(xStart, rowY);
    ctx.lineTo(xEnd, rowY);
    ctx.stroke();
  }

  // Crowd
  let seed = 42;
  function nextRandom(): number {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let x = xStart + 6; x < xEnd - 6; x += 8) {
    for (let row = 0; row < 3; row++) {
      if (nextRandom() > 0.6) continue;
      const py = standTop + 8 + row * 10 + nextRandom() * 4;
      ctx.fillStyle = CROWD_COLORS[Math.floor(nextRandom() * CROWD_COLORS.length)];
      ctx.fillRect(x, py, 3, 3);
    }
  }
}
