import type { TrackDefinition } from './track';

const CROWD_COLORS = ['#f2c14e', '#f25c5c', '#5cc2f2', '#8ef25c', '#f2f2f2', '#c78ef2'];

// Derives a straight's extent from the track data itself (rather than
// hardcoding coordinates) so this stays correct if the track shape changes.
function getHorizontalStraight(
  track: TrackDefinition,
  mode: 'min' | 'max'
): { xStart: number; xEnd: number; y: number } {
  const pts = track.centerline;
  const y = mode === 'max' ? Math.max(...pts.map((p) => p.y)) : Math.min(...pts.map((p) => p.y));
  const xs = pts.filter((p) => Math.abs(p.y - y) < 0.5).map((p) => p.x);
  return { xStart: Math.min(...xs), xEnd: Math.max(...xs), y };
}

function getVerticalStraight(
  track: TrackDefinition,
  mode: 'min' | 'max'
): { yStart: number; yEnd: number; x: number } {
  const pts = track.centerline;
  const x = mode === 'max' ? Math.max(...pts.map((p) => p.x)) : Math.min(...pts.map((p) => p.x));
  const ys = pts.filter((p) => Math.abs(p.x - x) < 0.5).map((p) => p.y);
  return { yStart: Math.min(...ys), yEnd: Math.max(...ys), x };
}

function offsetOutward(
  x: number,
  y: number,
  outwardAngle: number,
  distance: number
): { x: number; y: number } {
  return { x: x + distance * Math.cos(outwardAngle), y: y + distance * Math.sin(outwardAngle) };
}

// Draws in a local frame where +X runs along the stand (tangent to the
// track) and +Y points away from the track surface, then rotates/translates
// that frame into place - the same trick Car.render uses, which is what
// lets one function serve both the straight bottom stand and the angled
// corner stands without separate geometry for each.
function renderGrandstand(
  ctx: CanvasRenderingContext2D,
  edgeX: number,
  edgeY: number,
  outwardAngle: number,
  length: number,
  seed: number
): void {
  ctx.save();
  ctx.translate(edgeX, edgeY);
  ctx.rotate(outwardAngle - Math.PI / 2);

  const half = length / 2;
  const railY = 14;
  const standTop = railY + 10;
  const standHeight = 40;

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-half, railY);
  ctx.lineTo(half, railY);
  ctx.stroke();

  ctx.strokeStyle = '#999';
  ctx.lineWidth = 3;
  for (let x = -half; x <= half; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, railY - 6);
    ctx.lineTo(x, railY + 6);
    ctx.stroke();
  }

  ctx.fillStyle = '#555';
  ctx.fillRect(-half, standTop, length, standHeight);
  ctx.fillStyle = '#333';
  ctx.fillRect(-half - 4, standTop - 8, length + 8, 8);

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let rowY = standTop + 10; rowY < standTop + standHeight; rowY += 10) {
    ctx.beginPath();
    ctx.moveTo(-half, rowY);
    ctx.lineTo(half, rowY);
    ctx.stroke();
  }

  let s = seed;
  function nextRandom(): number {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }

  for (let x = -half + 6; x < half - 6; x += 8) {
    for (let row = 0; row < 3; row++) {
      if (nextRandom() > 0.6) continue;
      const py = standTop + 8 + row * 10 + nextRandom() * 4;
      ctx.fillStyle = CROWD_COLORS[Math.floor(nextRandom() * CROWD_COLORS.length)];
      ctx.fillRect(x, py, 3, 3);
    }
  }

  ctx.restore();
}

// A row of pit garages with a roof overhang, placed along the top straight.
function renderPitBuilding(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  trackEdgeY: number,
  spanWidth: number
): void {
  const width = Math.min(spanWidth, 260);
  const left = centerX - width / 2;
  const height = 50;
  const roofHeight = 10;
  const top = trackEdgeY - height;

  ctx.fillStyle = '#666';
  ctx.fillRect(left, top, width, height);

  ctx.fillStyle = '#444';
  ctx.fillRect(left - 4, top - roofHeight, width + 8, roofHeight);

  const doorCount = Math.max(3, Math.floor(width / 40));
  const doorWidth = width / doorCount;
  ctx.fillStyle = '#222';
  for (let i = 0; i < doorCount; i++) {
    ctx.fillRect(left + i * doorWidth + 4, top + 10, doorWidth - 8, height - 16);
  }

  ctx.fillStyle = '#c33';
  ctx.fillRect(left, trackEdgeY - 4, width, 4);
}

// A tall observation tower with windows, placed along the right straight.
function renderObservationBuilding(ctx: CanvasRenderingContext2D, trackEdgeX: number, centerY: number): void {
  const width = 50;
  const height = 90;
  const x = trackEdgeX;
  const y = centerY - height / 2;

  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = '#333';
  ctx.fillRect(x - 6, y - 10, width + 12, 10);

  ctx.fillStyle = '#a8d8ff';
  for (let wy = y + 10; wy < y + height - 10; wy += 16) {
    for (let wx = x + 6; wx < x + width - 6; wx += 14) {
      ctx.fillRect(wx, wy, 8, 10);
    }
  }

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y - 10);
  ctx.lineTo(x + width / 2, y - 26);
  ctx.stroke();
}

// Purely decorative - none of this blocks the car (that would be a separate
// collision feature).
export function renderTrackScenery(ctx: CanvasRenderingContext2D, track: TrackDefinition): void {
  const bottom = getHorizontalStraight(track, 'max');
  const bottomEdge = offsetOutward(
    (bottom.xStart + bottom.xEnd) / 2,
    bottom.y,
    Math.PI / 2,
    track.width / 2
  );
  renderGrandstand(ctx, bottomEdge.x, bottomEdge.y, Math.PI / 2, bottom.xEnd - bottom.xStart, 42);

  const bl = track.cornerAnchors.bottomLeft;
  const blEdge = offsetOutward(bl.x, bl.y, bl.outwardAngle, track.width / 2);
  renderGrandstand(ctx, blEdge.x, blEdge.y, bl.outwardAngle, 130, 7);

  const br = track.cornerAnchors.bottomRight;
  const brEdge = offsetOutward(br.x, br.y, br.outwardAngle, track.width / 2);
  renderGrandstand(ctx, brEdge.x, brEdge.y, br.outwardAngle, 130, 13);

  const top = getHorizontalStraight(track, 'min');
  renderPitBuilding(ctx, (top.xStart + top.xEnd) / 2, top.y - track.width / 2 - 10, top.xEnd - top.xStart);

  const right = getVerticalStraight(track, 'max');
  renderObservationBuilding(ctx, right.x + track.width / 2 + 20, (right.yStart + right.yEnd) / 2);
}
