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

// The full geometry of one corner's arc - center, radius, and sweep. Unlike
// CornerAnchor (a single point + direction, used for placing one object),
// this is enough to trace the whole curve, needed for things that follow
// the corner's shape along its length (gravel traps, curbing).
export interface CornerArc {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
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
  // All four corners' full arc geometry, for gravel traps/curbing that
  // needs to trace the curve's shape rather than anchor a single object.
  cornerArcs: CornerArc[];
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

  // All four corners' full arc geometry - same centers/sweeps used to
  // generate the centerline points above, kept alongside for anything
  // (gravel, curbing) that needs to trace the curve's shape.
  const cornerArcs: CornerArc[] = [
    { cx: x1 - r, cy: y0 + r, radius: r, startAngle: -Math.PI / 2, endAngle: 0 },
    { cx: x1 - r, cy: y1 - r, radius: r, startAngle: 0, endAngle: Math.PI / 2 },
    { cx: x0 + r, cy: y1 - r, radius: r, startAngle: Math.PI / 2, endAngle: Math.PI },
    { cx: x0 + r, cy: y0 + r, radius: r, startAngle: Math.PI, endAngle: Math.PI * 1.5 },
  ];

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
    cornerArcs,
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

// Interpolates the centerline's y at a given x, linearly between whichever
// pair of consecutive points brackets it - the *exact* same interpolation
// the canvas stroke does when connecting those points, so scenery that
// needs to touch the actual drawn road edge (not a separate geometric
// approximation of it, which can subtly mismatch the discretized polyline)
// can compute exactly where that is. approxY disambiguates which part of
// the loop, for tracks where multiple points might share a similar x.
export function centerlineYAtX(track: TrackDefinition, x: number, approxY: number): number {
  const pts = track.centerline;
  const n = pts.length;
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(pts[i].x - x, pts[i].y - approxY);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  function interpIfBrackets(a: Point, b: Point): number | null {
    if ((x >= a.x && x <= b.x) || (x <= a.x && x >= b.x)) {
      const t = b.x - a.x === 0 ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
    return null;
  }

  const prev = pts[(bestIndex - 1 + n) % n];
  const cur = pts[bestIndex];
  const next = pts[(bestIndex + 1) % n];
  return interpIfBrackets(prev, cur) ?? interpIfBrackets(cur, next) ?? cur.y;
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

// Each non-start checkpoint as a pass/fail flag - red until the car reaches
// it this lap (the actual pass/fail zone is unchanged, still the invisible
// checkpointRadius circle at the checkpoint's own position on the road),
// green after. Session-dependent (which checkpoints have been passed lives
// in LapTracker, not the static track), so this takes that status in
// rather than trying to derive it from track data alone.
export function renderCheckpointFlags(ctx: CanvasRenderingContext2D, track: TrackDefinition, passed: boolean[]): void {
  // Flags are planted on the infield side of each checkpoint rather than
  // right on the road, so they mark the zone without sitting in the way.
  // The offset direction is the local perpendicular to the track (not
  // "toward the loop's centroid" directly) - on an S-curve the road bulges
  // past the centroid, so a centroid-direction offset can land the flag on
  // the driving line itself instead of beside it. The centroid is only
  // used to pick which of the two perpendicular directions is inward.
  const centroidX = track.centerline.reduce((sum, p) => sum + p.x, 0) / track.centerline.length;
  const centroidY = track.centerline.reduce((sum, p) => sum + p.y, 0) / track.centerline.length;
  const pts = track.centerline;
  // Scales with road width so the flag always clears the track edge, plus
  // a fixed gap so it doesn't hug the boundary.
  const inwardOffset = track.width / 2 + 20;

  for (let i = 1; i < track.checkpoints.length; i++) {
    const cp = track.checkpoints[i];
    const color = passed[i - 1] ? '#3c3' : '#c33';

    // The centerline can contain back-to-back duplicate points (e.g. where
    // a straight segment's endpoint coincides exactly with the following
    // corner arc's first point) - stepping to the immediate next point can
    // land on that duplicate, giving a zero-length (undefined) direction.
    // Walk forward until a point that's actually different is found.
    const idx = pts.indexOf(cp);
    let nextIdx = (idx + 1) % pts.length;
    while (nextIdx !== idx && pts[nextIdx].x === cp.x && pts[nextIdx].y === cp.y) {
      nextIdx = (nextIdx + 1) % pts.length;
    }
    const next = pts[nextIdx];
    const dirX = next.x - cp.x;
    const dirY = next.y - cp.y;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    let nx = -dirY / dirLen;
    let ny = dirX / dirLen;

    // Flip the perpendicular so it points toward the centroid (inward)
    // rather than outward, whichever of the two directions that is here.
    if (nx * (centroidX - cp.x) + ny * (centroidY - cp.y) < 0) {
      nx = -nx;
      ny = -ny;
    }

    const baseX = cp.x + nx * inwardOffset;
    const baseY = cp.y + ny * inwardOffset;

    // The pole/flag extend further along the same inward normal as the
    // base offset (not a fixed screen-up direction) - near a straight-to-
    // corner transition, the corner's pavement can curve back into a
    // fixed-direction line even though the base point itself cleared the
    // road, which used to plant the flag graphic back on the track.
    const rx = -ny;
    const ry = nx;
    const tipX = baseX + nx * 26;
    const tipY = baseY + ny * 26;

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + nx * 20 + rx * 16, baseY + ny * 20 + ry * 16);
    ctx.lineTo(baseX + nx * 14, baseY + ny * 14);
    ctx.closePath();
    ctx.fill();
  }
}

function strokeClosedPath(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
}

// Gravel runoff traps and red/green acceleration-zone curbing at all four
// corners, following each corner's exact arc (center/radius/sweep) rather
// than an approximation, so both trace the same curve the car actually
// drives - the same "share one source of geometry" approach used
// everywhere else in this file.
export function renderCornerGravelAndCurbs(ctx: CanvasRenderingContext2D, track: TrackDefinition): void {
  for (const arc of track.cornerArcs) {
    const gravelInner = arc.radius + track.width / 2 + 2;
    const gravelOuter = gravelInner + 20;

    ctx.fillStyle = '#8a7355';
    ctx.beginPath();
    ctx.arc(arc.cx, arc.cy, gravelOuter, arc.startAngle, arc.endAngle);
    ctx.arc(arc.cx, arc.cy, gravelInner, arc.endAngle, arc.startAngle, true);
    ctx.closePath();
    ctx.fill();

    let seed = 77 + Math.round(arc.cx + arc.cy);
    function nextRandom(): number {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
    for (let i = 0; i < 50; i++) {
      const t = arc.startAngle + (arc.endAngle - arc.startAngle) * nextRandom();
      const rr = gravelInner + nextRandom() * (gravelOuter - gravelInner);
      ctx.fillStyle = nextRandom() > 0.5 ? '#9c8468' : '#766048';
      ctx.fillRect(arc.cx + rr * Math.cos(t), arc.cy + rr * Math.sin(t), 2, 2);
    }

    // Curb: alternating red/green segments painted right at the track's
    // outer edge, like the acceleration/braking markers at a real apex.
    const curbRadius = arc.radius + track.width / 2 - 5;
    const segments = 10;
    ctx.lineWidth = 8;
    for (let i = 0; i < segments; i++) {
      const t0 = arc.startAngle + ((arc.endAngle - arc.startAngle) * i) / segments;
      const t1 = arc.startAngle + ((arc.endAngle - arc.startAngle) * (i + 1)) / segments;
      ctx.strokeStyle = i % 2 === 0 ? '#c33' : '#3a3';
      ctx.beginPath();
      ctx.arc(arc.cx, arc.cy, curbRadius, t0, t1);
      ctx.stroke();
    }
  }
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
