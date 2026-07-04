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
  pieces.push({
    kind: 'pit',
    centerX: (top.xStart + top.xEnd) / 2,
    trackEdgeY: top.y - track.width / 2 - PIT_GAP,
    width: top.xEnd - top.xStart,
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

// A paved pit lane strip (gray, two-tone like the main road) with a
// smoothly curved, similarly-paved ramp at each end - wide enough to read
// as a real lane, not tapering to a point, and its outer edge lands
// exactly on the actual track edge (sampled via actualTopEdgeYAtX, which
// matches what's actually drawn there even on an S-curve) so it reads as
// a continuous, natural extension of the track rather than a separate
// patch. Visual only (not a drivable branch off the main loop yet - that
// needs lap-validation/collision work beyond what a marking can do).
function renderPitLaneMarkings(ctx: CanvasRenderingContext2D, track: TrackDefinition, piece: PitPiece): void {
  const width = Math.min(piece.width, PIT_MAX_WIDTH);
  const left = piece.centerX - width / 2;
  const right = left + width;
  const apronY = piece.trackEdgeY; // near edge of the pit building, facing the track
  const laneHalf = 20;

  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(left, apronY - laneHalf, width, laneHalf * 2);
  ctx.fillStyle = '#4d4d4d';
  ctx.fillRect(left, apronY - laneHalf + 4, width, laneHalf * 2 - 8);
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, apronY - laneHalf);
  ctx.lineTo(right, apronY - laneHalf);
  ctx.moveTo(left, apronY + laneHalf);
  ctx.lineTo(right, apronY + laneHalf);
  ctx.stroke();
  ctx.setLineDash([]);

  renderPitRamp(ctx, track, left, apronY, laneHalf, -1, 'PIT IN');
  renderPitRamp(ctx, track, right, apronY, laneHalf, 1, 'PIT OUT');
}

// A paved (not just painted-line) wedge curving from the lane to the
// actual track edge, staying at least minHalfWidth wide throughout - wide
// enough to look like a real lane a car could drive through, not a point -
// and it *widens* toward the track (like a real highway merge lane flaring
// out to join the road), not narrows, so the connection reads as opening
// into the road rather than pinching down to a stub beside it.
// The centerline eases toward a target *short* of the track edge by
// exactly farHalf, so once that half-width is added back on, the
// outer (track-facing) edge lands exactly on the real edge - never past
// it, never short of it - regardless of what width the ramp is at.
function renderPitRamp(
  ctx: CanvasRenderingContext2D,
  track: TrackDefinition,
  laneEndX: number,
  apronY: number,
  laneHalf: number,
  direction: 1 | -1,
  label: string
): void {
  const rampLength = 44;
  const farX = laneEndX + direction * rampLength;
  const trackEdgeY = actualTopEdgeYAtX(track, farX);
  const steps = 16;
  const farHalf = laneHalf * 1.7; // flares wider where it meets the main track
  // A few pixels of deliberate overlap into the track rather than an exact
  // tangent point - an exact touch is one rendering/rounding quirk away
  // from reading as a hairline gap, while a small overlap guarantees the
  // two surfaces visibly share ground no matter what.
  const overlap = 6;

  const centerYTarget = trackEdgeY - farHalf + overlap;

  const ease = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;
  const centerX = (t: number): number => laneEndX + (farX - laneEndX) * t;
  const centerY = (t: number): number => apronY + (centerYTarget - apronY) * ease(t);
  const halfWidth = (t: number): number => laneHalf + (farHalf - laneHalf) * ease(t);

  const innerEdge: Point[] = [];
  const outerEdge: Point[] = [];
  const innerEdgeInset: Point[] = [];
  const outerEdgeInset: Point[] = [];
  const stripeInset = 4; // matches the main track's dark-border/light-center treatment
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = centerX(t);
    const cy = centerY(t);
    const hw = halfWidth(t);
    innerEdge.push({ x, y: cy - hw });
    outerEdge.push({ x, y: cy + hw });
    const hwInset = Math.max(0, hw - stripeInset);
    innerEdgeInset.push({ x, y: cy - hwInset });
    outerEdgeInset.push({ x, y: cy + hwInset });
  }

  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.moveTo(innerEdge[0].x, innerEdge[0].y);
  for (const p of innerEdge.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = outerEdge.length - 1; i >= 0; i--) ctx.lineTo(outerEdge[i].x, outerEdge[i].y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#4d4d4d';
  ctx.beginPath();
  ctx.moveTo(innerEdgeInset[0].x, innerEdgeInset[0].y);
  for (const p of innerEdgeInset.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = outerEdgeInset.length - 1; i >= 0; i--) ctx.lineTo(outerEdgeInset[i].x, outerEdgeInset[i].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(innerEdge[0].x, innerEdge[0].y);
  for (const p of innerEdge.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.moveTo(outerEdge[0].x, outerEdge[0].y);
  for (const p of outerEdge.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, centerX(0.5), centerY(0.5) + 3);
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
