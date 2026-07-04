import { distancePointToSegment } from './math';

export interface Point {
  x: number;
  y: number;
}

export interface CornerAnchor {
  x: number;
  y: number;
  outwardAngle: number; // radians, direction pointing away from the track surface
}

export interface HorizontalStraightBounds {
  xStart: number;
  xEnd: number;
  y: number;
}

export interface VerticalStraightBounds {
  yStart: number;
  yEnd: number;
  x: number;
}

export interface TrackDefinition {
  name: string;
  centerline: Point[]; // closed loop - last point connects back to the first
  width: number;
  checkpoints: Point[]; // index 0 is the start/finish line
  checkpointRadius: number;
  startPosition: Point;
  startAngle: number;
  cornerAnchors: {
    bottomLeft: CornerAnchor;
    bottomRight: CornerAnchor;
  };
  // Nominal (uncurved) straight positions, for scenery placement - stable
  // reference lines regardless of whether an S-curve bends the actual
  // drivable surface on that side. Deriving these from the centerline
  // points instead (e.g. "the point with the smallest y") breaks once a
  // straight isn't flat, since an S-curve's peak can become the new min/max.
  topStraight: HorizontalStraightBounds;
  bottomStraight: HorizontalStraightBounds;
  leftStraight: VerticalStraightBounds;
  rightStraight: VerticalStraightBounds;
  // One polyline per S-curve, following the road's outer edge - a guardrail
  // specifically where a curve exists, to stop the car sliding off in
  // exactly the section that's hardest to hold a line through.
  sCurveGuardrails: Point[][];
  // Target lap time (seconds) used as the baseline for championship points.
  // A first guess, not derived from anything rigorous - like the physics
  // constants, meant to be tuned after actual playtesting.
  parLapTime: number;
}

export interface SCurveSpec {
  amplitude: number; // how far the curve deviates laterally from the straight
}

export interface RoundedRectTrackOptions {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cornerRadius: number;
  trackWidth: number;
  parLapTime: number;
  // Chicanes on specific straights - not supported on the bottom straight,
  // since it already has special-case handling for the start/finish line.
  topSCurve?: SCurveSpec;
  leftSCurve?: SCurveSpec;
  rightSCurve?: SCurveSpec;
}

interface StraightBuildResult {
  points: Point[];
  guardrail: Point[] | null;
}

// Points along a straight with an optional S-curve deviation, excluding the
// very start (t=0) - callers either push that point explicitly (the top
// straight, which has nothing before it) or it's already the last point of
// the preceding corner arc. When there's an S-curve, also returns a
// guardrail polyline offset outward by halfWidth, using the curve's exact
// tangent (from its derivative) to find the outward normal at each point -
// outwardSign flips it to the correct side per call site (verified visually,
// since working out the sign analytically for every orientation isn't worth
// the risk of getting it backwards silently).
function buildHorizontalStraight(
  xStart: number,
  xEnd: number,
  y: number,
  halfWidth: number,
  outwardSign: 1 | -1,
  sCurve?: SCurveSpec
): StraightBuildResult {
  if (!sCurve) return { points: [{ x: xEnd, y }], guardrail: null };
  const steps = 24;
  const points: Point[] = [];
  const guardrail: Point[] = [];
  const dxdt = xEnd - xStart;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = xStart + dxdt * t;
    const yPos = y + sCurve.amplitude * Math.sin(2 * Math.PI * t);
    points.push({ x, y: yPos });

    const dydt = sCurve.amplitude * 2 * Math.PI * Math.cos(2 * Math.PI * t);
    const len = Math.hypot(dxdt, dydt) || 1;
    const nx = (dydt / len) * outwardSign;
    const ny = (-dxdt / len) * outwardSign;
    guardrail.push({ x: x + nx * halfWidth, y: yPos + ny * halfWidth });
  }
  return { points, guardrail };
}

function buildVerticalStraight(
  yStart: number,
  yEnd: number,
  x: number,
  halfWidth: number,
  outwardSign: 1 | -1,
  sCurve?: SCurveSpec
): StraightBuildResult {
  if (!sCurve) return { points: [{ x, y: yEnd }], guardrail: null };
  const steps = 24;
  const points: Point[] = [];
  const guardrail: Point[] = [];
  const dydt = yEnd - yStart;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = yStart + dydt * t;
    const xPos = x + sCurve.amplitude * Math.sin(2 * Math.PI * t);
    points.push({ x: xPos, y });

    const dxdt = sCurve.amplitude * 2 * Math.PI * Math.cos(2 * Math.PI * t);
    const len = Math.hypot(dxdt, dydt) || 1;
    const nx = (dydt / len) * outwardSign;
    const ny = (-dxdt / len) * outwardSign;
    guardrail.push({ x: xPos + nx * halfWidth, y: y + ny * halfWidth });
  }
  return { points, guardrail };
}

// Generates a rounded-rectangle "stadium" circuit as a dense polyline.
// Using one polyline for both rendering and collision (rather than separate
// arc math for drawing and a simplified shape for collision) keeps the two
// impossible to accidentally disagree with each other. Parametrized so
// multiple tracks (different footprint, corner tightness, road width) can
// share this one generator instead of copy-pasting the whole shape.
export function createRoundedRectTrack(options: RoundedRectTrackOptions): TrackDefinition {
  const { name, x0, y0, x1, y1, trackWidth: width, parLapTime } = options;
  const r = options.cornerRadius;
  const arcSteps = 12;

  const points: Point[] = [];

  function arc(cx: number, cy: number, startAngle: number, endAngle: number): void {
    for (let i = 0; i <= arcSteps; i++) {
      const t = startAngle + ((endAngle - startAngle) * i) / arcSteps;
      points.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    }
  }

  const halfWidth = width / 2 + 14; // guardrail sits further outside the road edge

  // Clockwise loop starting on the top straight, matching the angle
  // convention used elsewhere (0 = facing right, increasing = clockwise).
  points.push({ x: x0 + r, y: y0 });
  const topResult = buildHorizontalStraight(x0 + r, x1 - r, y0, halfWidth, -1, options.topSCurve);
  points.push(...topResult.points);
  arc(x1 - r, y0 + r, -Math.PI / 2, 0);
  const rightResult = buildVerticalStraight(y0 + r, y1 - r, x1, halfWidth, 1, options.rightSCurve);
  points.push(...rightResult.points);
  arc(x1 - r, y1 - r, 0, Math.PI / 2);
  points.push({ x: x1 - r, y: y1 });
  const bottomMidIndex = points.length;
  points.push({ x: (x0 + x1) / 2, y: y1 }); // start/finish: center of the bottom straight
  points.push({ x: x0 + r, y: y1 });
  arc(x0 + r, y1 - r, Math.PI / 2, Math.PI);
  const leftResult = buildVerticalStraight(y1 - r, y0 + r, x0, halfWidth, -1, options.leftSCurve);
  points.push(...leftResult.points);
  arc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);

  const sCurveGuardrails: Point[][] = [topResult.guardrail, rightResult.guardrail, leftResult.guardrail].filter(
    (g): g is Point[] => g !== null
  );

  // Rotate the loop so the bottom-straight midpoint is index 0 - checkpoints,
  // start position, and start angle are all derived from points[0] below, so
  // rotating here is the one change needed to move the start/finish line.
  const rotated = points.slice(bottomMidIndex).concat(points.slice(0, bottomMidIndex));

  // Reverse the direction of travel while keeping the same start point:
  // flip the order of everything after index 0.
  const reversed = [rotated[0], ...rotated.slice(1).reverse()];
  points.length = 0;
  points.push(...reversed);

  // Corner geometry (arc center + sweep) is known here regardless of travel
  // direction or start rotation, so anchors are computed from the original
  // x0/y0/x1/y1/r values rather than re-derived from the point array.
  const bottomRightAngle = Math.PI / 4; // midpoint of that corner's 0..PI/2 sweep
  const bottomRightCorner: CornerAnchor = {
    x: x1 - r + r * Math.cos(bottomRightAngle),
    y: y1 - r + r * Math.sin(bottomRightAngle),
    outwardAngle: bottomRightAngle,
  };

  const bottomLeftAngle = (Math.PI / 2) + Math.PI / 4; // midpoint of PI/2..PI sweep
  const bottomLeftCorner: CornerAnchor = {
    x: x0 + r + r * Math.cos(bottomLeftAngle),
    y: y1 - r + r * Math.sin(bottomLeftAngle),
    outwardAngle: bottomLeftAngle,
  };

  const numCheckpoints = 8;
  const checkpoints: Point[] = [];
  for (let i = 0; i < numCheckpoints; i++) {
    checkpoints.push(points[Math.floor((i * points.length) / numCheckpoints)]);
  }

  const start = checkpoints[0];
  const startNextIndex = (points.indexOf(start) + 1) % points.length;
  const startNext = points[startNextIndex];
  const startAngle = Math.atan2(startNext.y - start.y, startNext.x - start.x);

  return {
    name,
    centerline: points,
    width,
    checkpoints,
    // Scales with road width (tuned to match the original 90-wide track's
    // radius of 50) so narrower tracks don't get a disproportionately huge
    // checkpoint zone relative to the road.
    checkpointRadius: Math.round(width * 0.56),
    startPosition: { x: start.x, y: start.y },
    startAngle,
    cornerAnchors: {
      bottomLeft: bottomLeftCorner,
      bottomRight: bottomRightCorner,
    },
    topStraight: { xStart: x0 + r, xEnd: x1 - r, y: y0 },
    bottomStraight: { xStart: x0 + r, xEnd: x1 - r, y: y1 },
    leftStraight: { yStart: y0 + r, yEnd: y1 - r, x: x0 },
    rightStraight: { yStart: y0 + r, yEnd: y1 - r, x: x1 },
    sCurveGuardrails,
    parLapTime,
  };
}

// Fictional, "inspired by" circuits - no real track layouts or names, per
// the project's legal note (docs/GDD.md). Different footprint/corner
// radius/road width per track gives each a genuinely different driving
// feel using the exact same generator.
export function getAllTracks(): TrackDefinition[] {
  return [
    createRoundedRectTrack({
      name: 'Silver Ridge Racetrack',
      x0: 160,
      y0: 120,
      x1: 800,
      y1: 520,
      cornerRadius: 100,
      trackWidth: 90,
      parLapTime: 15,
    }),
    createRoundedRectTrack({
      name: 'Victory Lane Circuit',
      x0: 220,
      y0: 130,
      x1: 740,
      y1: 510,
      cornerRadius: 70,
      trackWidth: 65,
      parLapTime: 14,
      topSCurve: { amplitude: 22 }, // long side
      rightSCurve: { amplitude: 18 }, // short side
    }),
    createRoundedRectTrack({
      // Rotated 90deg from its original tall/portrait layout to wide/
      // landscape, and enlarged - the S-curve moves from the (now short)
      // right straight to the (now long) top straight to preserve the
      // original "one long-side S-curve" intent.
      name: 'Sukura Speedway',
      x0: 200,
      y0: 180,
      x1: 760,
      y1: 460,
      cornerRadius: 75,
      trackWidth: 85,
      parLapTime: 14,
      topSCurve: { amplitude: 25 },
    }),
  ];
}

export function distanceToCenterline(track: TrackDefinition, x: number, y: number): number {
  const pts = track.centerline;
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = distancePointToSegment(x, y, a.x, a.y, b.x, b.y);
    if (d < min) min = d;
  }
  return min;
}

// Index of the centerline point closest to (x, y) - used by the cockpit
// camera to find where "ahead" starts along the loop.
export function findNearestPointIndex(track: TrackDefinition, x: number, y: number): number {
  const pts = track.centerline;
  let min = Infinity;
  let minIndex = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - x, pts[i].y - y);
    if (d < min) {
      min = d;
      minIndex = i;
    }
  }
  return minIndex;
}

export function renderTrack(ctx: CanvasRenderingContext2D, track: TrackDefinition): void {
  const pts = track.centerline;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = track.width;
  strokeClosedPath(ctx, pts);

  ctx.strokeStyle = '#4d4d4d';
  ctx.lineWidth = track.width - 8;
  strokeClosedPath(ctx, pts);

  for (let i = 1; i < track.checkpoints.length; i++) {
    const cp = track.checkpoints[i];
    ctx.fillStyle = 'rgba(255, 255, 0, 0.15)';
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, track.checkpointRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Checkered start/finish line, perpendicular to the track direction
  const start = track.checkpoints[0];
  const startIndex = pts.indexOf(start);
  const next = pts[(startIndex + 1) % pts.length];
  const dirX = next.x - start.x;
  const dirY = next.y - start.y;
  const angle = Math.atan2(dirY, dirX);

  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(angle);

  const checkSize = 8;
  const numAcross = Math.ceil(track.width / checkSize);
  const rows = 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < numAcross; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#111' : '#eee';
      ctx.fillRect((row - rows / 2) * checkSize, -track.width / 2 + col * checkSize, checkSize, checkSize);
    }
  }
  ctx.restore();
}

function strokeClosedPath(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
}

// A guardrail specifically along each S-curve's outer edge - the section
// hardest to hold a line through - with posts at intervals, matching the
// look of the grandstand guardrails elsewhere.
export function renderSCurveGuardrails(ctx: CanvasRenderingContext2D, track: TrackDefinition): void {
  for (const rail of track.sCurveGuardrails) {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rail[0].x, rail[0].y);
    for (let i = 1; i < rail.length; i++) ctx.lineTo(rail[i].x, rail[i].y);
    ctx.stroke();

    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    for (let i = 0; i < rail.length; i += 3) {
      const prev = rail[Math.max(0, i - 1)];
      const next = rail[Math.min(rail.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * 4;
      const py = (dx / len) * 4;
      ctx.beginPath();
      ctx.moveTo(rail[i].x - px, rail[i].y - py);
      ctx.lineTo(rail[i].x + px, rail[i].y + py);
      ctx.stroke();
    }
  }
}
