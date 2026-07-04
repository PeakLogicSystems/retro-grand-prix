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
// Gap between the track edge and each building - large enough that an
// S-curve's lateral swing (up to ~25-30px on the tracks that have one)
// can't reach far enough to visually overlap a fixed-position building.
const PIT_GAP = 35;
const TOWER_GAP = 30;

const OBS_WIDTH = 55; // across, perpendicular to the straight
const OBS_MAX_LENGTH = 200;

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

// A long two-story observation building with a railed viewing deck, more
// like a real trackside race control/media center than a narrow tower -
// runs along the straight the same way the grandstands and pit building do.
function renderObservationBuilding(ctx: CanvasRenderingContext2D, piece: TowerPiece): void {
  const x = piece.trackEdgeX;
  const length = piece.length;
  const yTop = piece.centerY - length / 2;

  // Roof, slightly overhanging the two-story body
  ctx.fillStyle = '#333';
  ctx.fillRect(x - 4, yTop - 4, OBS_WIDTH + 8, length + 8);

  // Two-story body
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(x, yTop, OBS_WIDTH, length);

  // Floor divider, splitting the body into two stories across its width
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + OBS_WIDTH / 2, yTop);
  ctx.lineTo(x + OBS_WIDTH / 2, yTop + length);
  ctx.stroke();

  // A column of windows per floor, running the building's length
  ctx.fillStyle = '#a8d8ff';
  for (let floor = 0; floor < 2; floor++) {
    const wx = x + 6 + floor * (OBS_WIDTH / 2);
    for (let wy = yTop + 8; wy < yTop + length - 8; wy += 15) {
      ctx.fillRect(wx, wy, OBS_WIDTH / 2 - 12, 9);
    }
  }

  // Railed viewing deck at the track-facing end
  const deckDepth = 14;
  ctx.fillStyle = '#666';
  ctx.fillRect(x - 6, yTop - deckDepth - 2, OBS_WIDTH + 12, deckDepth);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  for (let dx = x - 4; dx < x + OBS_WIDTH + 4; dx += 6) {
    ctx.beginPath();
    ctx.moveTo(dx, yTop - deckDepth - 2);
    ctx.lineTo(dx, yTop - 4);
    ctx.stroke();
  }

  // Antenna
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + OBS_WIDTH / 2, yTop - deckDepth - 2);
  ctx.lineTo(x + OBS_WIDTH / 2, yTop - deckDepth - 20);
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
      cx: piece.trackEdgeX + OBS_WIDTH / 2,
      cy: piece.centerY,
      angle: 0,
      halfLength: OBS_WIDTH / 2,
      halfWidth: piece.length / 2,
    };
  });
}
