import type { TrackDefinition } from './track';
import { findNearestPointIndex } from './track';
import type { Car } from './car';

const MAX_VIEW_DISTANCE = 420;
// Controls how quickly things shrink with distance - smaller = faster
// shrink (tighter, more dramatic perspective), larger = flatter/slower.
// Raised from the original value so the road stays readable for longer
// instead of collapsing to a thin sliver a short way ahead.
const PERSPECTIVE_K = 190;
const HORIZON_Y_FRACTION = 0.38;
const MAX_PROJECTED_POINTS = 50;
// The literal track width read as too narrow to drive by comfortably in
// this view - deliberately exaggerated well past strict accuracy so the
// road is genuinely easy to track visually, not just technically visible.
const WIDTH_EXAGGERATION = 1.75;

interface ProjectedPoint {
  screenX: number;
  screenY: number;
  halfWidth: number;
}

// Projects the track points ahead of the car into screen space using a
// simple perspective-divide (scale ~ 1/distance), the same trick behind
// classic pseudo-3D racers like Pole Position/Out Run - not real 3D, just
// 2D shapes positioned and scaled to read as depth.
// How far around the nearest point to search, in track points rather than
// distance - generous enough to comfortably cover a full corner.
const SEARCH_WINDOW_BACK = 15;
const SEARCH_WINDOW_FORWARD = 60;

interface RelativePoint {
  forwardDist: number;
  lateralDist: number;
}

function gatherCandidates(
  indices: number[],
  pts: { x: number; y: number }[],
  car: Car,
  headingX: number,
  headingY: number,
  rightX: number,
  rightY: number
): RelativePoint[] {
  const result: RelativePoint[] = [];
  for (const idx of indices) {
    const p = pts[idx];
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const forwardDist = dx * headingX + dy * headingY;
    const lateralDist = dx * rightX + dy * rightY;
    if (forwardDist < -10 || forwardDist > MAX_VIEW_DISTANCE) continue;
    result.push({ forwardDist, lateralDist });
  }
  return result;
}

function projectRoadAhead(
  canvas: HTMLCanvasElement,
  horizonY: number,
  track: TrackDefinition,
  car: Car
): ProjectedPoint[] {
  const pts = track.centerline;
  const n = pts.length;
  const nearestIndex = findNearestPointIndex(track, car.x, car.y);

  const headingX = Math.cos(car.angle);
  const headingY = Math.sin(car.angle);
  const rightX = -Math.sin(car.angle);
  const rightY = Math.cos(car.angle);

  // Walking strictly forward through track-order points (relative to the
  // car's heading) breaks down when the car has spun significantly off the
  // track's direction - e.g. sliding through a fast corner, which the slip
  // physics allows. Track points that are geometrically just ahead can end
  // up with a negative forward-distance relative to a heading pointing the
  // "wrong" way, so a strictly-forward walk finds nothing and the road
  // renders as blank. Searching a window on both sides of the nearest point
  // and sorting by actual distance from the camera is robust to most cases.
  const windowIndices: number[] = [];
  for (let offset = -SEARCH_WINDOW_BACK; offset <= SEARCH_WINDOW_FORWARD; offset++) {
    windowIndices.push(((nearestIndex + offset) % n + n) % n);
  }
  let candidates = gatherCandidates(windowIndices, pts, car, headingX, headingY, rightX, rightY);

  // Rare extreme cases (e.g. the car overshoots far past a corner with no
  // steering at all, ending up nearest to a point whose surrounding window
  // still doesn't contain anything the heading considers "ahead") can leave
  // even that windowed search empty. Falling back to scanning every point
  // guarantees something renders instead of a blank screen.
  if (candidates.length < 2) {
    const allIndices = Array.from({ length: n }, (_, i) => i);
    candidates = gatherCandidates(allIndices, pts, car, headingX, headingY, rightX, rightY);
  }

  candidates.sort((a, b) => a.forwardDist - b.forwardDist);

  // The track's straights only have 2 points (start and end) - fine for
  // collision/overhead rendering, but too sparse here: without a point
  // right at the car's own position, the near edge of the road can land
  // partway up the screen instead of touching the bottom, making the road
  // look like it "detaches" from the camera. Prepending a synthetic point
  // exactly at the car guarantees the nearest edge is always anchored.
  const projected: ProjectedPoint[] = [
    { screenX: canvas.width / 2, screenY: canvas.height, halfWidth: (track.width / 2) * WIDTH_EXAGGERATION },
  ];

  for (const c of candidates) {
    const clampedDist = Math.max(c.forwardDist, 0);
    const scale = PERSPECTIVE_K / (PERSPECTIVE_K + clampedDist);

    projected.push({
      screenX: canvas.width / 2 + c.lateralDist * scale,
      screenY: horizonY + scale * (canvas.height - horizonY),
      halfWidth: (track.width / 2) * WIDTH_EXAGGERATION * scale,
    });

    if (projected.length >= MAX_PROJECTED_POINTS) break;
  }

  return projected;
}

function renderGround(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, projected: ProjectedPoint[]): void {
  // Alternating light/dark bands across the full width, keyed to the same
  // distance steps as the road - the classic Out Run "scrolling ground"
  // trick that makes speed and distance readable even off the road surface.
  for (let i = projected.length - 2; i >= 0; i--) {
    const a = projected[i];
    const b = projected[i + 1];
    ctx.fillStyle = i % 2 === 0 ? '#173a17' : '#1d451d';
    ctx.fillRect(0, b.screenY, canvas.width, a.screenY - b.screenY);
  }
}

function renderRoad(ctx: CanvasRenderingContext2D, projected: ProjectedPoint[]): void {
  const curbWidth = 8;

  // Far-to-near so nearer segments paint over farther ones
  for (let i = projected.length - 2; i >= 0; i--) {
    const a = projected[i];
    const b = projected[i + 1];
    const stripe = i % 2 === 0 ? '#c33' : '#eee';

    // Curbs (rumble strips) just outside each edge of the road surface
    ctx.fillStyle = stripe;
    ctx.beginPath();
    ctx.moveTo(a.screenX - a.halfWidth - curbWidth, a.screenY);
    ctx.lineTo(a.screenX - a.halfWidth, a.screenY);
    ctx.lineTo(b.screenX - b.halfWidth, b.screenY);
    ctx.lineTo(b.screenX - b.halfWidth - curbWidth, b.screenY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(a.screenX + a.halfWidth, a.screenY);
    ctx.lineTo(a.screenX + a.halfWidth + curbWidth, a.screenY);
    ctx.lineTo(b.screenX + b.halfWidth + curbWidth, b.screenY);
    ctx.lineTo(b.screenX + b.halfWidth, b.screenY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(a.screenX - a.halfWidth, a.screenY);
    ctx.lineTo(a.screenX + a.halfWidth, a.screenY);
    ctx.lineTo(b.screenX + b.halfWidth, b.screenY);
    ctx.lineTo(b.screenX - b.halfWidth, b.screenY);
    ctx.closePath();
    ctx.fill();

    // Dashed center line, skipping every other segment for the dashes
    if (i % 2 === 0) {
      ctx.fillStyle = '#ddd';
      const centerHalf = Math.max(1, a.halfWidth * 0.03);
      ctx.beginPath();
      ctx.moveTo(a.screenX - centerHalf, a.screenY);
      ctx.lineTo(a.screenX + centerHalf, a.screenY);
      ctx.lineTo(b.screenX + centerHalf, b.screenY);
      ctx.lineTo(b.screenX - centerHalf, b.screenY);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Small overhead schematic of the whole track with a dot for the car's
// current position and heading - the pseudo-3D forward view alone doesn't
// tell you where you are on the circuit, so this fills that gap directly
// rather than trying to stretch the perspective view to do it.
function renderMiniMap(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  track: TrackDefinition,
  car: Car
): void {
  const mapWidth = 170;
  const mapHeight = 120;
  const mapX = canvas.width - mapWidth - 16;
  // Below the [G]/[V]/[ESC] buttons (main.ts draws them at y=8, height=26)
  // rather than overlapping them - the two were fighting for the same
  // top-right corner before.
  const mapY = 44;
  const padding = 10;

  const xs = track.centerline.map((p) => p.x);
  const ys = track.centerline.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((mapWidth - padding * 2) / (maxX - minX), (mapHeight - padding * 2) / (maxY - minY));

  function toMap(x: number, y: number): { x: number; y: number } {
    return {
      x: mapX + padding + (x - minX) * scale,
      y: mapY + padding + (y - minY) * scale,
    };
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);

  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const first = toMap(track.centerline[0].x, track.centerline[0].y);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < track.centerline.length; i++) {
    const p = toMap(track.centerline[i].x, track.centerline[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();

  const carPos = toMap(car.x, car.y);
  const headingLen = 9;
  ctx.strokeStyle = '#4fc3f7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(carPos.x, carPos.y);
  ctx.lineTo(carPos.x + Math.cos(car.angle) * headingLen, carPos.y + Math.sin(car.angle) * headingLen);
  ctx.stroke();

  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.arc(carPos.x, carPos.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

// A simplified F1-style open-wheel cockpit: most of the wheel sits below
// the visible frame (as it would from a seated driving position), so the
// "F1-ness" comes from what peeks into view - a thick rim with a top
// center marker, and a spoke/hub with a small display panel - plus dark
// cockpit-side shapes framing the edges like the sides of an open cockpit.
function renderDashboard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const w = canvas.width;
  const h = canvas.height;

  // Cockpit side pods
  ctx.fillStyle = '#0d0d0d';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h - 130);
  ctx.lineTo(70, h - 90);
  ctx.lineTo(90, h);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w, h);
  ctx.lineTo(w, h - 130);
  ctx.lineTo(w - 70, h - 90);
  ctx.lineTo(w - 90, h);
  ctx.closePath();
  ctx.fill();

  // Hood
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(60, h);
  ctx.lineTo(60, h - 55);
  ctx.quadraticCurveTo(w / 2, h - 90, w - 60, h - 55);
  ctx.lineTo(w - 60, h);
  ctx.closePath();
  ctx.fill();

  const wheelCenterX = w / 2;
  const wheelCenterY = h + 55;
  const wheelRadius = 95;

  // Spoke/hub rising up to the rim, with a small display + button dots -
  // the bit of an F1 wheel's center that would be visible over the rim
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(wheelCenterX - 10, wheelCenterY - wheelRadius - 6, 20, wheelRadius + 6);
  ctx.fillStyle = '#0a2a3a';
  ctx.fillRect(wheelCenterX - 16, wheelCenterY - wheelRadius - 2, 32, 20);
  ctx.fillStyle = '#4fc3f7';
  ctx.fillRect(wheelCenterX - 12, wheelCenterY - wheelRadius + 2, 24, 6);
  ctx.fillStyle = '#e33';
  ctx.beginPath();
  ctx.arc(wheelCenterX - 24, wheelCenterY - wheelRadius + 6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3c3';
  ctx.beginPath();
  ctx.arc(wheelCenterX + 24, wheelCenterY - wheelRadius + 6, 4, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.arc(wheelCenterX, wheelCenterY, wheelRadius, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(wheelCenterX, wheelCenterY, wheelRadius - 12, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Top-center marker, like the centering stripe on a real racing wheel
  ctx.fillStyle = '#ffe066';
  ctx.fillRect(wheelCenterX - 6, wheelCenterY - wheelRadius - 8, 12, 16);
}

export function renderCockpitView(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  track: TrackDefinition,
  car: Car
): void {
  const horizonY = canvas.height * HORIZON_Y_FRACTION;

  ctx.fillStyle = '#1b2a4a';
  ctx.fillRect(0, 0, canvas.width, horizonY);

  // Base fill in case the projected point list is ever too short to fully
  // cover the ground (renderGround only fills between consecutive points).
  ctx.fillStyle = '#173a17';
  ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

  const projected = projectRoadAhead(canvas, horizonY, track, car);

  renderGround(ctx, canvas, projected);
  renderRoad(ctx, projected);
  renderDashboard(ctx, canvas);
  renderMiniMap(ctx, canvas, track, car);

  // If even the farthest point found is still essentially at the camera
  // (near the bottom of the screen), the car is facing roughly
  // perpendicular to the track - e.g. right after spinning out - so there
  // genuinely isn't a road ahead of the nose to show. That's an honest
  // first-person consequence of a bad crash, not a bug, but it can look
  // like the view broke without a hint that the map still knows where you are.
  const last = projected[projected.length - 1];
  if (!last || last.screenY > canvas.height - 40) {
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO ROAD AHEAD - CHECK MAP', canvas.width / 2, horizonY + 40);
  }
}
