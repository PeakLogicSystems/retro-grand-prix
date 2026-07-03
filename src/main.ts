import './style.css';
import { InputManager } from './game/input';
import { Car } from './game/car';
import { startGameLoop } from './game/loop';
import { clamp } from './game/math';

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #game-canvas in index.html');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('2D rendering context is not supported in this browser');
}

main(canvas, ctx);

function main(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const input = new InputManager();
  const car = new Car(canvas.width / 2, canvas.height / 2);

  function drawGrid(): void {
    const spacing = 50;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  startGameLoop(
    (dt) => {
      car.update(dt, {
        forward: input.isDown('ArrowUp') || input.isDown('KeyW'),
        backward: input.isDown('ArrowDown') || input.isDown('KeyS'),
        left: input.isDown('ArrowLeft') || input.isDown('KeyA'),
        right: input.isDown('ArrowRight') || input.isDown('KeyD'),
      });

      // No track yet (that's M2) - keep the car on screen in the meantime
      car.x = clamp(car.x, 20, canvas.width - 20);
      car.y = clamp(car.y, 20, canvas.height - 20);
    },
    () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawGrid();

      car.render(ctx);

      ctx.fillStyle = '#0f0';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`speed: ${car.speed.toFixed(0)} px/s`, 10, 20);
    }
  );
}
