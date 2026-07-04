import type { TrackDefinition, Point } from './track';
import { centerlineYAtX } from './track';
import type { Obstacle } from './collision';

const CROWD_COLORS = ['#f2c14e', '#f25c5c', '#5cc2f2', '#8ef25c', '#f2f2f2', '#c78ef2'];

// Grandstand geometry, in the local frame used by renderGrandstand (+X
// along the stand, +Y outward from the track). Shared with the obstacle
// derivation below so the visible stand and its hitbox can't drift apart.
const STAND_RAIL_Y = 14;
const STAND_NEAR_Y = 10; // slightly before the rail - small forgiving margin
const STAND_TOP_Y = STAND_RAIL_Y + 10;
const STAND_HEIGHT = 40;
const STAND_FAR_Y = STAND_TOP_Y + STAND_HEIGHT;

const PIT_HEIGHT = 50;
const PIT_ROOF_HEIGHT = 10;
const PIT_MAX_WIDTH = 260;
// Gap between the track edge and each building/stand - large enough that
// an S-curve's lateral swing (up to ~25-30px on the tracks that have one)
// can't reach far enough to visually overlap a fixed-position building,
// with extra breathing room on top of the strict minimum.
const PIT_GAP = 48;
const TOWER_GAP = 42;
const STAND_GAP = 14;

const OBS_WIDTH = 55; // across, perpendicular to the straight (building only)
const OBS_MAX_LENGTH = 200;
const OBS_STAND_DEPTH = 16; // ground-level stands in front of the building

interface StandPiece {
  kind: 'stand';
  edgeX: number;
  edgeY: number;
  outwardAngle: number;
  length: number;
  seed: number;
}

interface PitPiece {
  kind: 'pit';
  centerX: number;
  trackEdgeY: number;
  width: number;
  // How far the entry/exit taper reaches, in world units - sized per track
  // from its own available clearance (space between the building and the
  // corners), so a track with more room gets a longer, gentler curve and a
  // tighter one still gets something proportionate rather than identical
  // ramps regardless of how much space each track actually has.
  taperLength: number;
}

interface TowerPiece {
  kind: 'tower';
  trackEdgeX: number;
  centerY: number;
  length: number;
}

type SceneryPiece = StandPiece | PitPiece | TowerPiece;

function offsetOutward(
  x: number,
  y: number,
  outwardAngle: number,
  distance: number
): { x: number; y: number } {
  return { x: x + distance * Math.cos(outwardAngle), y: y + distance * Math.sin(outwardAngle) };
}

function localToWorld(
  originX: number,
  originY: number,
  angle: number,
  localX: number,
  localY: number
): { x: number; y: number } {
  return {
    x: originX + localX * Math.cos(angle) - localY * Math.sin(angle),
    y: originY + localX * Math.sin(angle) + localY * Math.cos(angle),
  };
}

// The top straight's *actual* road edge at a given x - reads the real
// rendered centerline (via the exact same linear interpolation the canvas
// stroke uses between points) rather than recomputing the S-curve formula
// separately, which could subtly mismatch the drawn polyline. Whatever the
// road actually does at this x, this matches it exactly.
function actualTopEdgeYAtX(track: TrackDefinition, x: number): number {
  return centerlineYAtX(track, x, track.topStraight.y) - track.width / 2;
}

function getSceneryPieces(track: TrackDefinition): SceneryPiece[] {
  const pieces: SceneryPiece[] = [];

  const bottom = track.bottomStraight;
  const bottomEdge = offsetOutward(
    (bottom.xStart + bottom.xEnd) / 2,
    bottom.y,
    Math.PI / 2,
    track.width / 2 + STAND_GAP
  );
  pieces.push({
    kind: 'stand',
    edgeX: bottomEdge.x,
    edgeY: bottomEdge.y,
    outwardAngle: Math.PI / 2,
    length: bottom.xEnd - bottom.xStart,
    seed: 42,
  });

  const bl = track.cornerAnchors.bottomLeft;
  const blEdge = offsetOutward(bl.x, bl.y, bl.outwardAngle, track.width / 2 + STAND_GAP);
  pieces.push({ kind: 'stand', edgeX: blEdge.x, edgeY: blEdge.y, outwardAngle: bl.outwardAngle, length: 130, seed: 7 });

  const br = track.cornerAnchors.bottomRight;
  const brEdge = offsetOutward(br.x, br.y, br.outwardAngle, track.width / 2 + STAND_GAP);
  pieces.push({ kind: 'stand', edgeX: brEdge.x, edgeY: brEdge.y, outwardAngle: br.outwardAngle, length: 130, seed: 13 });

  const top = track.topStraight;
  const pitFullWidth = top.xEnd - top.xStart;
  const pitDisplayWidth = Math.min(pitFullWidth, PIT_MAX_WIDTH);
  const pitClearance = (pitFullWidth - pitDisplayWidth) / 2;
  pieces.push({
    kind: 'pit',
    centerX: (top.xStart + top.xEnd) / 2,
    trackEdgeY: top.y - track.width / 2 - PIT_GAP,
    width: pitFullWidth,
    taperLength: Math.max(20, Math.min(pitClearance * 0.7, 90)),
  });

  const right = track.rightStraight;
  pieces.push({
    kind: 'tower',
    trackEdgeX: right.x + track.width / 2 + TOWER_GAP,
    centerY: (right.yStart + right.yEnd) / 2,
    length: Math.min(right.yEnd - right.yStart, OBS_MAX_LENGTH),
  });

  return pieces;
}

// Draws in a local frame where +X runs along the stand (tangent to the
// track) and +Y points away from the track surface, then rotates/translates
// that frame into place - the same trick Car.render uses, which is what
// lets one function serve both the straight bottom stand and the angled
// corner stands without separate geometry for each.
function renderGrandstand(ctx: CanvasRenderingContext2D, piece: StandPiece): void {
  ctx.save();
  ctx.translate(piece.edgeX, piece.edgeY);
  ctx.rotate(piece.outwardAngle - Math.PI / 2);

  const half = piece.length / 2;

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-half, STAND_RAIL_Y);
  ctx.lineTo(half, STAND_RAIL_Y);
  ctx.stroke();

  ctx.strokeStyle = '#999';
  ctx.lineWidth = 3;
  for (let x = -half; x <= half; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, STAND_RAIL_Y - 6);
    ctx.lineTo(x, STAND_RAIL_Y + 6);
    ctx.stroke();
  }

  ctx.fillStyle = '#555';
  ctx.fillRect(-half, STAND_TOP_Y, piece.length, STAND_HEIGHT);
  ctx.fillStyle = '#333';
  ctx.fillRect(-half - 4, STAND_TOP_Y - 8, piece.length + 8, 8);

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let rowY = STAND_TOP_Y + 10; rowY < STAND_TOP_Y + STAND_HEIGHT; rowY += 10) {
    ctx.beginPath();
    ctx.moveTo(-half, rowY);
    ctx.lineTo(half, rowY);
    ctx.stroke();
  }

  let s = piece.seed;
  function nextRandom(): number {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }

  for (let x = -half + 6; x < half - 6; x += 8) {
    for (let row = 0; row < 3; row++) {
      if (nextRandom() > 0.6) continue;
      const py = STAND_TOP_Y + 8 + row * 10 + nextRandom() * 4;
      ctx.fillStyle = CROWD_COLORS[Math.floor(nextRandom() * CROWD_COLORS.length)];
      ctx.fillRect(x, py, 3, 3);
    }
  }

  ctx.restore();
}

// A row of pit garages with a roof overhang, placed along the top straight.
function renderPitBuilding(ctx: CanvasRenderingContext2D, piece: PitPiece): void {
  const width = Math.min(piece.width, PIT_MAX_WIDTH);
  const left = piece.centerX - width / 2;
  const top = piece.trackEdgeY - PIT_HEIGHT;

  ctx.fillStyle = '#666';
  ctx.fillRect(left, top, width, PIT_HEIGHT);

  ctx.fillStyle = '#444';
  ctx.fillRect(left - 4, top - PIT_ROOF_HEIGHT, width + 8, PIT_ROOF_HEIGHT);

  const doorCount = Math.max(3, Math.floor(width / 40));
  const doorWidth = width / doorCount;
  ctx.fillStyle = '#222';
  for (let i = 0; i < doorCount; i++) {
    ctx.fillRect(left + i * doorWidth + 4, top + 10, doorWidth - 8, PIT_HEIGHT - 16);
  }

  ctx.fillStyle = '#c33';
  ctx.fillRect(left, piece.trackEdgeY - 4, width, 4);
}

// A long two-story observation building, more like a real trackside race
// control/media center than a narrow tower. The roof only covers the far
// (outward) half - the near (track-facing) half of the upper floor is an
// open-glass viewing deck, which needs an unobstructed view of the track
// rather than a roof over it. Ground-level bleacher stands sit in front.
function renderObservationBuilding(ctx: CanvasRenderingContext2D, piece: TowerPiece): void {
  const length = piece.length;
  const yTop = piece.centerY - length / 2;
  const halfW = OBS_WIDTH / 2;

  const standX = piece.trackEdgeX;
  const buildingX = standX + OBS_STAND_DEPTH;

  // Ground-level stands in front of the building
  ctx.fillStyle = '#555';
  ctx.fillRect(standX, yTop, OBS_STAND_DEPTH, length);
  let s = 55;
  function nextRandom(): number {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }
  for (let ly = yTop + 4; ly < yTop + length - 4; ly += 6) {
    if (nextRandom() > 0.5) continue;
    ctx.fillStyle = CROWD_COLORS[Math.floor(nextRandom() * CROWD_COLORS.length)];
    ctx.fillRect(standX + 3 + nextRandom() * (OBS_STAND_DEPTH - 6), ly, 3, 3);
  }

  // Roof over the far (outward) half only
  ctx.fillStyle = '#333';
  ctx.fillRect(buildingX + halfW, yTop - 4, halfW + 4, length + 8);

  // Building body
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(buildingX, yTop, OBS_WIDTH, length);

  // Far (roofed) half: ordinary small windows
  ctx.fillStyle = '#a8d8ff';
  for (let wy = yTop + 8; wy < yTop + length - 8; wy += 16) {
    ctx.fillRect(buildingX + halfW + 6, wy, halfW - 12, 8);
  }

  // Near (track-facing) half: the second-story observation deck - long
  // windows spanning most of the building's length, reading as a
  // glass-fronted viewing lounge rather than a regular floor.
  for (let wy = yTop + 6; wy < yTop + length - 6; wy += 20) {
    ctx.fillRect(buildingX + 4, wy, halfW - 8, 14);
  }

  // Checkered flags on poles at both ends of the roofed side. Both flags
  // face the same way (left/-x), and the south pole is inverted (extends
  // +y, away from the building) so it mirrors the north pole (extends -y,
  // also away from the building) rather than both pointing the same way
  // in world space.
  const poleX = buildingX + halfW + halfW / 2;
  renderCheckeredFlagPole(ctx, poleX, yTop - 4, 18, -1);
  renderCheckeredFlagPole(ctx, poleX, yTop + length + 4, 18, 1);
}

function renderCheckeredFlagPole(
  ctx: CanvasRenderingContext2D,
  poleX: number,
  poleBaseY: number,
  poleHeight: number,
  poleDirection: 1 | -1
): void {
  const tipY = poleBaseY + poleDirection * poleHeight;
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(poleX, poleBaseY);
  ctx.lineTo(poleX, tipY);
  ctx.stroke();

  // Flag sits at the free end (tip), extending back toward the base, and
  // always to the left (-x) of the pole regardless of which way it points.
  const checkSize = 5;
  const flagOriginX = poleX - checkSize * 2;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#111' : '#eee';
      const y = tipY + row * checkSize * -poleDirection;
      ctx.fillRect(flagOriginX + col * checkSize, y, checkSize, checkSize);
    }
  }
}

// Matches how a real pit road entry/exit works (per reference photos): the
// pit lane and the main track are one continuous paved surface that forks
// apart, not two separately-bordered lanes joined by a ramp. The
// track-facing edge follows the real (possibly S-curved) road edge at
// every x via actualTopEdgeYAtX, so the fork is solid pavement all the way
// - no gap, no separate lane geometry that can visually mismatch the road.
// A single white "fork line" at each end marks the entry/exit point, the
// same way real pit lanes paint one line at the split rather than a full
// two-sided lane boundary. Visual only (not a drivable branch off the main
// loop yet - that needs lap-validation/collision work beyond what a
// marking can do).
function renderPitLaneMarkings(ctx: CanvasRenderingContext2D, track: TrackDefinition, piece: PitPiece): void {
  const width = Math.min(piece.width, PIT_MAX_WIDTH);
  const left = piece.centerX - width / 2;
  const right = left + width;
  const apronY = piece.trackEdgeY; // near edge of the pit building, facing the track
  const steps = 32;
  // Sized per track from the pit piece's own available clearance (see
  // getSceneryPieces). The curve extends *beyond* the building's own
  // width, into the clearance space toward each corner, rather than
  // eating into the building's frontage - so the paved lane stays the
  // building's full width the entire way across, and only narrows down
  // to meet the road edge past either end.
  const taperLength = piece.taperLength;
  const pavedLeft = left - taperLength;
  const pavedRight = right + taperLength;
  const ease = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

  const topEdge: Point[] = [];
  const roadEdge: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = pavedLeft + ((pavedRight - pavedLeft) * i) / steps;
    const edgeY = actualTopEdgeYAtX(track, x);
    let topY = apronY;
    if (x < left) {
      topY = edgeY + (apronY - edgeY) * ease((x - pavedLeft) / taperLength);
    } else if (x > right) {
      topY = edgeY + (apronY - edgeY) * ease((pavedRight - x) / taperLength);
    }
    topEdge.push({ x, y: topY });
    roadEdge.push({ x, y: edgeY });
  }

  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.moveTo(topEdge[0].x, topEdge[0].y);
  for (const p of topEdge.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = roadEdge.length - 1; i >= 0; i--) ctx.lineTo(roadEdge[i].x, roadEdge[i].y);
  ctx.closePath();
  ctx.fill();

  // Lighter center stripe, like the main track's two-tone road surface.
  const inset = 5;
  ctx.fillStyle = '#4d4d4d';
  ctx.beginPath();
  ctx.moveTo(topEdge[0].x, topEdge[0].y + inset);
  for (const p of topEdge.slice(1)) ctx.lineTo(p.x, p.y + inset);
  for (let i = roadEdge.length - 1; i >= 0; i--) ctx.lineTo(roadEdge[i].x, roadEdge[i].y - inset);
  ctx.closePath();
  ctx.fill();

  // Guardrail only along the curved taper sections (not the flat middle,
  // where it would just run parallel to and duplicate the two-tone
  // stripe's own edge a few pixels away) - same style as the S-curve
  // guardrails elsewhere, framing just the merge curves.
  const leftCurve = topEdge.filter((p) => p.x <= left);
  const rightCurve = topEdge.filter((p) => p.x >= right);
  for (const curve of [leftCurve, rightCurve]) {
    if (curve.length < 2) continue;
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(curve[0].x, curve[0].y);
    for (const p of curve.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    for (let i = 0; i < curve.length; i += 3) {
      const prev = curve[Math.max(0, i - 1)];
      const next = curve[Math.min(curve.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 5;
      const ny = (dx / len) * 5;
      ctx.beginPath();
      ctx.moveTo(curve[i].x - nx, curve[i].y - ny);
      ctx.lineTo(curve[i].x + nx, curve[i].y + ny);
      ctx.stroke();
    }
  }

  // Orange/white striped barrier separating the pit lane from the track,
  // only along the flat section in front of the building - not extending
  // into the entry/exit curves, where a barrier would block the merge
  // itself. Short alternating-color segments at a fixed physical length
  // (independent of the coarse sampling grid), the same hazard-stripe look
  // as a real pit wall.
  const stripeLength = 8;
  const flatSpan = right - left;
  const numStripes = Math.max(1, Math.round(flatSpan / stripeLength));
  for (let i = 0; i < numStripes; i++) {
    const x0 = left + (flatSpan * i) / numStripes;
    const x1 = left + (flatSpan * (i + 1)) / numStripes;
    ctx.strokeStyle = i % 2 === 0 ? '#e67e22' : '#eee';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, actualTopEdgeYAtX(track, x0));
    ctx.lineTo(x1, actualTopEdgeYAtX(track, x1));
    ctx.stroke();
  }

  // Labels only - the guardrail curves above already mark the entry/exit
  // shape, so a separate fork line here was just a redundant second line
  // tracing nearly the same path.
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PIT IN', left, apronY - 8);
  ctx.fillText('PIT OUT', right, apronY - 8);
}

export function renderTrackScenery(ctx: CanvasRenderingContext2D, track: TrackDefinition): void {
  for (const piece of getSceneryPieces(track)) {
    if (piece.kind === 'stand') renderGrandstand(ctx, piece);
    else if (piece.kind === 'pit') {
      renderPitLaneMarkings(ctx, track, piece);
      renderPitBuilding(ctx, piece);
    } else renderObservationBuilding(ctx, piece);
  }
}

// Solid hitboxes matching the rendered scenery exactly, since both are
// derived from the same piece geometry above.
export function getSceneryObstacles(track: TrackDefinition): Obstacle[] {
  return getSceneryPieces(track).map((piece): Obstacle => {
    if (piece.kind === 'stand') {
      const renderAngle = piece.outwardAngle - Math.PI / 2;
      const center = localToWorld(piece.edgeX, piece.edgeY, renderAngle, 0, (STAND_NEAR_Y + STAND_FAR_Y) / 2);
      return {
        cx: center.x,
        cy: center.y,
        angle: renderAngle,
        halfLength: piece.length / 2,
        halfWidth: (STAND_FAR_Y - STAND_NEAR_Y) / 2,
      };
    }

    if (piece.kind === 'pit') {
      const width = Math.min(piece.width, PIT_MAX_WIDTH);
      return {
        cx: piece.centerX,
        cy: piece.trackEdgeY - (PIT_HEIGHT + PIT_ROOF_HEIGHT) / 2,
        angle: 0,
        halfLength: width / 2,
        halfWidth: (PIT_HEIGHT + PIT_ROOF_HEIGHT) / 2,
      };
    }

    return {
      cx: piece.trackEdgeX + (OBS_STAND_DEPTH + OBS_WIDTH) / 2,
      cy: piece.centerY,
      angle: 0,
      halfLength: (OBS_STAND_DEPTH + OBS_WIDTH) / 2,
      halfWidth: piece.length / 2,
    };
  });
}

// One thin rectangular obstacle per guardrail segment - approximates the
// curving rail as a chain of short straight walls, which reuses the
// existing rotated-rectangle collision resolver instead of needing a
// separate polyline-collision system just for this.
export function getSCurveGuardrailObstacles(track: TrackDefinition): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const rail of track.sCurveGuardrails) {
    for (let i = 0; i < rail.length - 1; i++) {
      const a = rail[i];
      const b = rail[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      obstacles.push({
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        angle: Math.atan2(dy, dx),
        halfLength: Math.hypot(dx, dy) / 2,
        halfWidth: 3,
      });
    }
  }
  return obstacles;
}

export interface CockpitBillboard {
  x: number;
  y: number;
  footprintWidth: number; // real-world size used as the sprite's width
  height: number; // real-world vertical height, purely a visual guess -
  // the overhead game has no concept of building height, so cockpit view
  // needs its own per-kind number here
  color: string;
}

// A flat "billboard" stand-in for each scenery piece, positioned/sized in
// world units - cockpitView.ts projects these through the same
// perspective math as the road, the classic Out Run trick of drawing
// roadside objects as flat sprites that scale with distance rather than
// true 3D geometry.
export function getCockpitBillboards(track: TrackDefinition): CockpitBillboard[] {
  return getSceneryPieces(track).map((piece): CockpitBillboard => {
    if (piece.kind === 'stand') {
      const renderAngle = piece.outwardAngle - Math.PI / 2;
      const center = localToWorld(piece.edgeX, piece.edgeY, renderAngle, 0, (STAND_NEAR_Y + STAND_FAR_Y) / 2);
      return { x: center.x, y: center.y, footprintWidth: piece.length, height: 45, color: '#555' };
    }
    if (piece.kind === 'pit') {
      const width = Math.min(piece.width, PIT_MAX_WIDTH);
      return {
        x: piece.centerX,
        y: piece.trackEdgeY - (PIT_HEIGHT + PIT_ROOF_HEIGHT) / 2,
        footprintWidth: width,
        height: 60,
        color: '#666',
      };
    }
    return {
      x: piece.trackEdgeX + (OBS_STAND_DEPTH + OBS_WIDTH) / 2,
      y: piece.centerY,
      footprintWidth: piece.length,
      height: 140,
      color: '#4a4a5a',
    };
  });
}
