import './style.css';
import { InputManager } from './game/input';
import { Car } from './game/car';
import { startGameLoop } from './game/loop';
import { clamp } from './game/math';
import { createOvalTrack, distanceToCenterline, renderTrack } from './game/track';
import { LapTracker } from './game/lapTracker';
import { renderTrackScenery } from './game/scenery';

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

function main(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const input = new InputManager();
  const track = createOvalTrack();
  const car = new Car(track.startPosition.x, track.startPosition.y, track.startAngle);
  const lapTracker = new LapTracker(track.checkpoints, track.checkpointRadius);

  // Keyboard events only reach an element that has focus. The browser's
  // address bar can hold focus after navigation, so controls silently do
  // nothing until the player clicks the canvas - this makes that obvious.
  let hasFocus = false;
  canvas.addEventListener('focus', () => (hasFocus = true));
  canvas.addEventListener('blur', () => (hasFocus = false));
  canvas.addEventListener('click', () => canvas.focus());
  canvas.focus();

  let onTrack = true;

  startGameLoop(
    (dt) => {
      const grip = onTrack ? 1 : OFF_TRACK_GRIP;

      car.update(
        dt,
        {
          forward: input.isDown('ArrowUp') || input.isDown('KeyW'),
          backward: input.isDown('ArrowDown') || input.isDown('KeyS'),
          left: input.isDown('ArrowLeft') || input.isDown('KeyA'),
          right: input.isDown('ArrowRight') || input.isDown('KeyD'),
        },
        grip
      );

      // The track doesn't fill the whole canvas, and there's no world
      // beyond the canvas yet - this is a temporary hard edge, not a wall.
      car.x = clamp(car.x, 20, canvas.width - 20);
      car.y = clamp(car.y, 20, canvas.height - 20);

      onTrack = distanceToCenterline(track, car.x, car.y) <= track.width / 2;
      lapTracker.update(dt, car.x, car.y);
    },
    () => {
      ctx.fillStyle = '#173a17';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      renderTrack(ctx, track);
      renderTrackScenery(ctx, track);

      car.render(ctx);

      ctx.fillStyle = '#0f0';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`speed: ${Math.abs(pxPerSecToMph(car.speed)).toFixed(0)} mph`, 10, 20);
      ctx.fillText(`on track: ${onTrack}`, 10, 40);
      ctx.fillText(`lap: ${lapTracker.lapCount}`, 10, 60);
      ctx.fillText(`time: ${lapTracker.currentLapTime.toFixed(2)}s`, 10, 80);
      ctx.fillText(
        `best: ${lapTracker.bestLapTime !== null ? lapTracker.bestLapTime.toFixed(2) + 's' : '--'}`,
        10,
        100
      );
      ctx.fillText(`slip: ${Math.abs(angleDiffDegrees(car.angle, car.travelAngle)).toFixed(0)} deg`, 10, 120);

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
