import './style.css';
import { InputManager } from './game/input';
import { Car, renderGhostCar } from './game/car';
import { startGameLoop } from './game/loop';
import { clamp } from './game/math';
import { getAllTracks, distanceToCenterline, renderTrack, renderSCurveGuardrails, type TrackDefinition } from './game/track';
import { LapTracker } from './game/lapTracker';
import { renderTrackScenery, getSceneryObstacles, getSCurveGuardrailObstacles } from './game/scenery';
import { resolveObstacleCollisions, type Obstacle } from './game/collision';
import { renderCockpitView } from './game/cockpitView';
import { renderTrackSelectMenu } from './game/menu';
import { sampleGhostAt, type GhostFrame } from './game/ghost';
import { loadBestTimes, saveBestTime, loadGhost, saveGhost, clearBest } from './game/storage';
import { SoundEngine } from './game/audio';

// Mirrors Car's private maxSpeed - used only to normalize engine pitch/volume.
const APPROX_TOP_SPEED = 225;

type ViewMode = 'overhead' | 'cockpit';

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #game-canvas in index.html');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('2D rendering context is not supported in this browser');
}

main(canvas, ctx);

// Placeholder scale until a track gives pixels a real-world size - tuned so
// the car's current top speed reads as a plausible F1 top speed.
const MPH_PER_PXPS = 0.75;
function pxPerSecToMph(pxPerSec: number): number {
  return pxPerSec * MPH_PER_PXPS;
}

// Off-track grip: how much acceleration/steering the car keeps on grass.
const OFF_TRACK_GRIP = 0.35;

function angleDiffDegrees(a: number, b: number): number {
  const diff = (((a - b + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return (diff * 180) / Math.PI;
}

// Real clickable UI buttons (not just hint text) - computed fresh from the
// current session each time by both the renderer and the click handler, so
// their positions/labels can never drift out of sync with each other.
interface UiButton {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

// [V]/[ESC] sit together in the top-right corner; [G] stacks directly below
// [ESC], right-aligned with it, rather than crowding the same row.
function getRaceButtons(canvas: HTMLCanvasElement): UiButton[] {
  const y = 8;
  const height = 26;
  const gap = 8;

  const menu: UiButton = { x: canvas.width - 10 - 100, y, width: 100, height, label: '[ESC] MENU' };
  const view: UiButton = { x: menu.x - gap - 90, y, width: 90, height, label: '[V] VIEW' };

  return [view, menu];
}

function getGhostButton(session: RaceSession, canvas: HTMLCanvasElement): UiButton {
  const width = 140;
  const menuX = canvas.width - 10 - 100;
  return {
    x: menuX + 100 - width, // right-aligned with [ESC] MENU, directly below it
    y: 8 + 26 + 8,
    width,
    height: 26,
    label: `[G] GHOST: ${session.ghostVisible ? 'ON' : 'OFF'}`,
  };
}

function pointInButton(x: number, y: number, b: UiButton): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

function renderButton(ctx: CanvasRenderingContext2D, b: UiButton): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(b.x, b.y, b.width, b.height);
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x, b.y, b.width, b.height);
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.label, b.x + b.width / 2, b.y + b.height / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

// Everything that belongs to one specific track attempt - rebuilt from
// scratch each time a track is (re)selected, rather than mutating shared
// state, so leftover state from a previous track can't leak into the next.
interface RaceSession {
  track: TrackDefinition;
  car: Car;
  lapTracker: LapTracker;
  obstacles: Obstacle[];
  onTrack: boolean;
  crashFlashTimer: number;
  viewMode: ViewMode;
  ghost: GhostFrame[] | null; // best lap recorded so far (this session or a previous one)
  ghostVisible: boolean;
  recording: GhostFrame[]; // frames captured during the lap currently in progress
}

// How far back from the checkered line the car spawns, so it starts behind
// the line rather than sitting on top of/overlapping it.
const START_GRID_SETBACK = 25;

function createRaceSession(track: TrackDefinition): RaceSession {
  const bestTimes = loadBestTimes();
  const carStartX = track.startPosition.x - Math.cos(track.startAngle) * START_GRID_SETBACK;
  const carStartY = track.startPosition.y - Math.sin(track.startAngle) * START_GRID_SETBACK;
  return {
    track,
    car: new Car(carStartX, carStartY, track.startAngle),
    lapTracker: new LapTracker(track.checkpoints, track.checkpointRadius, bestTimes[track.name] ?? null),
    obstacles: [...getSceneryObstacles(track), ...getSCurveGuardrailObstacles(track)],
    onTrack: true,
    crashFlashTimer: 0,
    viewMode: 'overhead',
    ghost: loadGhost(track.name),
    ghostVisible: true,
    recording: [],
  };
}

type GameState = { kind: 'menu'; selectedIndex: number } | { kind: 'race'; session: RaceSession };

function main(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const input = new InputManager();
  const tracks = getAllTracks();
  const sound = new SoundEngine();

  // Keyboard events only reach an element that has focus. The browser's
  // address bar can hold focus after navigation, so controls silently do
  // nothing until the player clicks the canvas - this makes that obvious.
  // The same click is a real user gesture, so it doubles as what unlocks
  // audio (browsers block sound until one occurs).
  let hasFocus = false;
  canvas.addEventListener('focus', () => (hasFocus = true));
  canvas.addEventListener('blur', () => (hasFocus = false));
  canvas.focus();

  let state: GameState = { kind: 'menu', selectedIndex: 0 };

  // Clicking anywhere focuses/unlocks audio as before, but a click landing
  // on one of the on-screen buttons also performs that button's action
  // directly - real clickable controls, not just keyboard-shortcut hints.
  canvas.addEventListener('click', (e) => {
    canvas.focus();
    sound.resume();

    if (state.kind !== 'race') return;
    const session = state.session;

    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const clickY = ((e.clientY - rect.top) * canvas.height) / rect.height;

    const [viewBtn, menuBtn] = getRaceButtons(canvas);
    if (pointInButton(clickX, clickY, viewBtn)) {
      session.viewMode = session.viewMode === 'overhead' ? 'cockpit' : 'overhead';
      sound.playMenuMove();
    } else if (pointInButton(clickX, clickY, menuBtn)) {
      const returnIndex = tracks.indexOf(session.track);
      state = { kind: 'menu', selectedIndex: returnIndex < 0 ? 0 : returnIndex };
      sound.playMenuSelect();
    } else if (pointInButton(clickX, clickY, getGhostButton(session, canvas))) {
      session.ghostVisible = !session.ghostVisible;
      sound.playMenuMove();
    }
  });

  startGameLoop(
    (dt) => {
      if (state.kind === 'menu') {
        sound.updateEngine(0, false);

        if (input.consumePress('ArrowUp') || input.consumePress('KeyW')) {
          state.selectedIndex = (state.selectedIndex - 1 + tracks.length) % tracks.length;
          sound.playMenuMove();
        }
        if (input.consumePress('ArrowDown') || input.consumePress('KeyS')) {
          state.selectedIndex = (state.selectedIndex + 1) % tracks.length;
          sound.playMenuMove();
        }
        if (input.consumePress('KeyR')) {
          clearBest(tracks[state.selectedIndex].name);
          sound.playCrash();
        }
        if (input.consumePress('Enter') || input.consumePress('Space')) {
          sound.playMenuSelect();
          state = { kind: 'race', session: createRaceSession(tracks[state.selectedIndex]) };
        }
        return;
      }

      const session = state.session;

      if (input.consumePress('KeyG')) {
        session.ghostVisible = !session.ghostVisible;
      }

      if (input.consumePress('Escape')) {
        const returnIndex = tracks.indexOf(session.track);
        state = { kind: 'menu', selectedIndex: returnIndex < 0 ? 0 : returnIndex };
        return;
      }
      if (input.consumePress('KeyV')) {
        session.viewMode = session.viewMode === 'overhead' ? 'cockpit' : 'overhead';
      }

      const grip = session.onTrack ? 1 : OFF_TRACK_GRIP;

      session.car.update(
        dt,
        {
          forward: input.isDown('ArrowUp') || input.isDown('KeyW'),
          backward: input.isDown('ArrowDown') || input.isDown('KeyS'),
          left: input.isDown('ArrowLeft') || input.isDown('KeyA'),
          right: input.isDown('ArrowRight') || input.isDown('KeyD'),
        },
        grip
      );

      if (resolveObstacleCollisions(session.car, session.obstacles)) {
        session.crashFlashTimer = 0.6;
        sound.playCrash();
      }
      session.crashFlashTimer = Math.max(0, session.crashFlashTimer - dt);

      sound.updateEngine(session.car.speed / APPROX_TOP_SPEED, true);

      // The track doesn't fill the whole canvas, and there's no world
      // beyond the canvas yet - this is a temporary hard edge, not a wall.
      session.car.x = clamp(session.car.x, 20, canvas.width - 20);
      session.car.y = clamp(session.car.y, 20, canvas.height - 20);

      session.onTrack = distanceToCenterline(session.track, session.car.x, session.car.y) <= session.track.width / 2;

      const lapResult = session.lapTracker.update(dt, session.car.x, session.car.y);
      if (lapResult.completedLap) {
        if (lapResult.isNewBest && lapResult.completedLapTime !== null) {
          session.ghost = session.recording;
          saveBestTime(session.track.name, lapResult.completedLapTime);
          saveGhost(session.track.name, session.ghost);
          sound.playNewBest();
        } else {
          sound.playCheckpoint();
        }
        session.recording = [];
      } else if (lapResult.reachedCheckpoint) {
        sound.playCheckpoint();
      }
      session.recording.push({
        t: session.lapTracker.currentLapTime,
        x: session.car.x,
        y: session.car.y,
        angle: session.car.angle,
      });
    },
    () => {
      if (state.kind === 'menu') {
        renderTrackSelectMenu(ctx, canvas, tracks, state.selectedIndex);
        return;
      }

      const session = state.session;

      if (session.viewMode === 'overhead') {
        ctx.fillStyle = '#173a17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        renderTrack(ctx, session.track);
        renderSCurveGuardrails(ctx, session.track);
        renderTrackScenery(ctx, session.track);

        // Ghost of the best lap so far, positioned by the current lap's
        // elapsed time - not implemented for cockpit view yet (would need
        // to project the ghost through the same perspective math as the
        // road), so it only appears in overhead view for now.
        if (session.ghost && session.ghostVisible) {
          const ghostPos = sampleGhostAt(session.ghost, session.lapTracker.currentLapTime);
          if (ghostPos) renderGhostCar(ctx, ghostPos.x, ghostPos.y, ghostPos.angle);
        }

        session.car.render(ctx);
      } else {
        renderCockpitView(ctx, canvas, session.track, session.car);
      }

      for (const button of getRaceButtons(canvas)) {
        renderButton(ctx, button);
      }

      ctx.fillStyle = '#0f0';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(session.track.name, 10, 20);
      ctx.fillText(`speed: ${Math.abs(pxPerSecToMph(session.car.speed)).toFixed(0)} mph`, 10, 40);
      ctx.fillText(`on track: ${session.onTrack}`, 10, 60);
      ctx.fillText(`lap: ${session.lapTracker.lapCount}`, 10, 80);
      ctx.fillText(`time: ${session.lapTracker.currentLapTime.toFixed(2)}s`, 10, 100);
      ctx.fillText(
        `best: ${session.lapTracker.bestLapTime !== null ? session.lapTracker.bestLapTime.toFixed(2) + 's' : '--'}`,
        10,
        120
      );
      ctx.fillText(
        `slip: ${Math.abs(angleDiffDegrees(session.car.angle, session.car.travelAngle)).toFixed(0)} deg`,
        10,
        140
      );
      renderButton(ctx, getGhostButton(session, canvas));

      if (session.crashFlashTimer > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${(session.crashFlashTimer / 0.6) * 0.5})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRASH!', canvas.width / 2, canvas.height / 2);
      }

      if (!hasFocus) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CLICK TO ENABLE CONTROLS', canvas.width / 2, canvas.height / 2);
      }
    }
  );
}
