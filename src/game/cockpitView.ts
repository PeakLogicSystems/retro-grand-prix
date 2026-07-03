import type { TrackDefinition } from './track';
import { findNearestPointIndex } from './track';
import type { Car } from './car';

const MAX_VIEW_DISTANCE = 500;
// Controls how quickly things shrink with distance - smaller = faster
// shrink (tighter, more dramatic perspective), larger = flatter/slower.
const PERSPECTIVE_K = 140;
const HORIZON_Y_FRACTION = 0.42;
const MAX_PROJECTED_POINTS = 50;

interface ProjectedPoint {
  screenX: number;
  screenY: number;
  halfWidth: number;
}

// Projects the track points ahead of the car into screen space using a
// simple perspective-divide (scale ~ 1/distance), the same trick behind
// classic pseudo-3D racers like Pole Position/Out Run - not real 3D, just
// 2D shapes positioned and scaled to read as depth.
function projectRoadAhead(
  canvas: HTMLCanvasElement,
  horizonY: number,
  track: TrackDefinition,
  car: Car
): ProjectedPoint[] {
  const pts = track.centerline;
  const n = pts.length;
  const startIndex = findNearestPointIndex(track, car.x, car.y);

  const headingX = Math.cos(car.angle);
  const headingY = Math.sin(car.angle);
  const rightX = -Math.sin(car.angle);
  const rightY = Math.cos(car.angle);

  // The track's straights only have 2 points (start and end) - fine for
  // collision/overhead rendering, but too sparse here: without a point
  // right at the car's own position, the near edge of the road can land
  // partway up the screen instead of touching the bottom, making the road
  // look like it "detaches" from the camera. Prepending a synthetic point
  // exactly at the car guarantees the nearest edge is always anchored.
  const projected: ProjectedPoint[] = [
    { screenX: canvas.width / 2, screenY: canvas.height, halfWidth: track.width / 2 },
  ];

  for (let step = 0; step < n; step++) {
    const p = pts[(startIndex + step) % n];
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const forwardDist = dx * headingX + dy * headingY;
    const lateralDist = dx * rightX + dy * rightY;

    if (forwardDist > MAX_VIEW_DISTANCE) break;
    if (forwardDist < -40) {
      if (projected.length > 1) break; // was ahead, now behind - loop closed
      continue; // still catching up to the camera's position
    }

    const clampedDist = Math.max(forwardDist, 0);
    const scale = PERSPECTIVE_K / (PERSPECTIVE_K + clampedDist);

    projected.push({
      screenX: canvas.width / 2 + lateralDist * scale,
      screenY: horizonY + scale * (canvas.height - horizonY),
      halfWidth: (track.width / 2) * scale,
    });

    if (projected.length >= MAX_PROJECTED_POINTS) break;
  }

  return projected;
}

function renderDashboard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#0d0d0d';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h - 60);
  ctx.quadraticCurveTo(w / 2, h - 100, w, h - 60);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(w / 2, h + 40, 90, Math.PI, Math.PI * 2);
  ctx.stroke();
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

  ctx.fillStyle = '#173a17';
  ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

  const projected = projectRoadAhead(canvas, horizonY, track, car);

  // Far-to-near so nearer segments paint over farther ones
  for (let i = projected.length - 2; i >= 0; i--) {
    const a = projected[i];
    const b = projected[i + 1];

    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(a.screenX - a.halfWidth, a.screenY);
    ctx.lineTo(a.screenX + a.halfWidth, a.screenY);
    ctx.lineTo(b.screenX + b.halfWidth, b.screenY);
    ctx.lineTo(b.screenX - b.halfWidth, b.screenY);
    ctx.closePath();
    ctx.fill();
  }

  renderDashboard(ctx, canvas);
}
