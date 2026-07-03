import { clamp } from './math';

export interface CarControls {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export class Car {
  x: number;
  y: number;
  angle = 0; // radians, 0 = facing right
  speed = 0; // px/sec, positive = forward, negative = reverse

  private readonly maxSpeed = 260;
  private readonly maxReverseSpeed = -120;
  private readonly acceleration = 220;
  private readonly brakingForce = 340;
  private readonly coastFriction = 140;
  private readonly turnRate = Math.PI * 1.1;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  update(dt: number, controls: CarControls): void {
    if (controls.forward) {
      this.speed += this.acceleration * dt;
    } else if (controls.backward) {
      // Braking (fast) while still rolling forward, reversing (slower) once stopped
      const decel = this.speed > 0 ? this.brakingForce : this.acceleration;
      this.speed -= decel * dt;
    } else {
      const drag = this.coastFriction * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - drag);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + drag);
    }

    this.speed = clamp(this.speed, this.maxReverseSpeed, this.maxSpeed);

    // A stationary car can't turn, and steering direction flips in reverse
    if (this.speed !== 0) {
      const steerInput = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
      const direction = this.speed > 0 ? 1 : -1;
      this.angle += steerInput * this.turnRate * direction * dt;
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const length = 24;
    const width = 12;

    ctx.fillStyle = '#e33';
    ctx.fillRect(-length / 2, -width / 2, length, width);

    // White nose marker so facing direction is visible at a glance
    ctx.fillStyle = '#fff';
    ctx.fillRect(length / 2 - 4, -width / 2, 4, width);

    ctx.restore();
  }
}
