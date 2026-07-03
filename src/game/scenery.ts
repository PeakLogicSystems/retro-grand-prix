import type { TrackDefinition } from './track';
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

const TOWER_WIDTH = 50;
const TOWER_HEIGHT = 90;

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
}

type SceneryPiece = StandPiece | PitPiece | TowerPiece;

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

  const bottom = getHorizontalStraight(track, 'max');
  const bottomEdge = offsetOutward(
    (bottom.xStart + bottom.xEnd) / 2,
    bottom.y,
    Math.PI / 2,
    track.width / 2
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
  const blEdge = offsetOutward(bl.x, bl.y, bl.outwardAngle, track.width / 2);
  pieces.push({ kind: 'stand', edgeX: blEdge.x, edgeY: blEdge.y, outwardAngle: bl.outwardAngle, length: 130, seed: 7 });

  const br = track.cornerAnchors.bottomRight;
  const brEdge = offsetOutward(br.x, br.y, br.outwardAngle, track.width / 2);
  pieces.push({ kind: 'stand', edgeX: brEdge.x, edgeY: brEdge.y, outwardAngle: br.outwardAngle, length: 130, seed: 13 });

  const top = getHorizontalStraight(track, 'min');
  pieces.push({
    kind: 'pit',
    centerX: (top.xStart + top.xEnd) / 2,
    trackEdgeY: top.y - track.width / 2 - 10,
    width: top.xEnd - top.xStart,
  });

  const right = getVerticalStraight(track, 'max');
  pieces.push({
    kind: 'tower',
    trackEdgeX: right.x + track.width / 2 + 20,
    centerY: (right.yStart + right.yEnd) / 2,
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

// A tall observation tower with windows, placed along the right straight.
function renderObservationBuilding(ctx: CanvasRenderingContext2D, piece: TowerPiece): void {
  const x = piece.trackEdgeX;
  const y = piece.centerY - TOWER_HEIGHT / 2;

  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(x, y, TOWER_WIDTH, TOWER_HEIGHT);

  ctx.fillStyle = '#333';
  ctx.fillRect(x - 6, y - 10, TOWER_WIDTH + 12, 10);

  ctx.fillStyle = '#a8d8ff';
  for (let wy = y + 10; wy < y + TOWER_HEIGHT - 10; wy += 16) {
    for (let wx = x + 6; wx < x + TOWER_WIDTH - 6; wx += 14) {
      ctx.fillRect(wx, wy, 8, 10);
    }
  }

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + TOWER_WIDTH / 2, y - 10);
  ctx.lineTo(x + TOWER_WIDTH / 2, y - 26);
  ctx.stroke();
}

export function renderTrackScenery(ctx: CanvasRenderingContext2D, track: TrackDefinition): void {
  for (const piece of getSceneryPieces(track)) {
    if (piece.kind === 'stand') renderGrandstand(ctx, piece);
    else if (piece.kind === 'pit') renderPitBuilding(ctx, piece);
    else renderObservationBuilding(ctx, piece);
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
      cx: piece.trackEdgeX + TOWER_WIDTH / 2,
      cy: piece.centerY,
      angle: 0,
      halfLength: TOWER_WIDTH / 2,
      halfWidth: TOWER_HEIGHT / 2,
    };
  });
}
