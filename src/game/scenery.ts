import type { TrackDefinition, Point } from './track';
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

// A continuous pit lane strip running the length of the building (where
// cars would drive past the garages), with a smoothly-tapered on-ramp and
// off-ramp at either end merging into the main track edge - like a real
// highway ramp widening to meet the road, not just a floating diagonal
// patch. Visual only for now (not a drivable branch off the main loop yet;
// that needs lap-validation/collision work beyond what a marking can do).
function renderPitLaneMarkings(ctx: CanvasRenderingContext2D, piece: PitPiece): void {
  const width = Math.min(piece.width, PIT_MAX_WIDTH);
  const left = piece.centerX - width / 2;
  const right = left + width;
  const apronY = piece.trackEdgeY; // near edge of the pit building, facing the track
  const trackEdgeY = apronY + PIT_GAP; // the actual track's outer edge
  const laneHalf = 14;

  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(left, apronY - laneHalf, width, laneHalf * 2);
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

  // Mirror images of each other (direction flips which way the ramp flares
  // out), so the exit is a proper reflection of the entry, not a
  // differently-shaped patch.
  renderPitRamp(ctx, left, apronY, trackEdgeY, laneHalf, -1, 'PIT IN');
  renderPitRamp(ctx, right, apronY, trackEdgeY, laneHalf, 1, 'PIT OUT');
}

// An S-shaped ramp (ease-in/ease-out via a raised cosine) rather than a
// straight taper, so its tangent is horizontal at both the pit-lane end and
// the main-track end - a real smooth merge instead of meeting the track at
// a sharp angle.
function renderPitRamp(
  ctx: CanvasRenderingContext2D,
  laneEndX: number,
  apronY: number,
  trackEdgeY: number,
  laneHalf: number,
  direction: 1 | -1,
  label: string
): void {
  const rampLength = 44;
  const farX = laneEndX + direction * rampLength;
  const farHalf = laneHalf * 1.8; // flares wider where it meets the main track
  const steps = 16;

  const ease = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;
  const centerX = (t: number): number => laneEndX + (farX - laneEndX) * t;
  const centerY = (t: number): number => apronY + (trackEdgeY - apronY) * ease(t);
  const halfWidth = (t: number): number => laneHalf + (farHalf - laneHalf) * ease(t);

  const innerEdge: Point[] = [];
  const outerEdge: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = centerX(t);
    const cy = centerY(t);
    const hw = halfWidth(t);
    innerEdge.push({ x, y: cy - hw });
    outerEdge.push({ x, y: cy + hw });
  }

  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.moveTo(innerEdge[0].x, innerEdge[0].y);
  for (const p of innerEdge.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = outerEdge.length - 1; i >= 0; i--) ctx.lineTo(outerEdge[i].x, outerEdge[i].y);
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
      renderPitLaneMarkings(ctx, piece);
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
