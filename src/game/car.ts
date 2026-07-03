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
  angle: number; // heading (chassis direction), radians - 0 = facing right
  speed = 0; // px/sec, magnitude of actual ground velocity (for HUD display)

  private vx = 0;
  private vy = 0;

  private readonly maxSpeed = 260;
  private readonly maxReverseSpeed = -120;
  private readonly acceleration = 220;
  private readonly brakingForce = 340;
  private readonly coastFriction = 140;
  private readonly turnRate = Math.PI * 1.1;
  private readonly maxOffTrackDrag = 260;
  // How fast sideways (lateral) slip decays - this is "tire grip". Higher
  // = corners feel glued down; lower = corners feel like ice.
  private readonly gripStrength = 10;

  constructor(x: number, y: number, angle = 0) {
    this.x = x;
    this.y = y;
    this.angle = angle;
  }

  // grip: 1 = full traction (on track), lower values (e.g. on grass) weaken
  // acceleration and let lateral slip decay much more slowly - a gradual
  // slide rather than an instant speed cap, which would feel like teleporting.
  update(dt: number, controls: CarControls, grip = 1): void {
    const g = clamp(grip, 0, 1);

    // Steering always rotates the chassis heading at a fixed rate - grip no
    // longer directly slows the wheel turn. Instead, low grip shows up as
    // more slip below, which is the physically honest version of "harder to
    // control on grass" (the wheel still turns; the tires just can't follow).
    const priorSpeed = Math.hypot(this.vx, this.vy);
    if (priorSpeed > 1) {
      const steerInput = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
      const travelingForward = this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle) >= 0;
      const direction = travelingForward ? 1 : -1;
      this.angle += steerInput * this.turnRate * direction * dt;
    }

    // Decompose the momentum carried over from last frame against the
    // *just-rotated* heading. Any mismatch here is the tire slip angle -
    // this is what makes the car's actual path lag behind a sharp turn.
    const fwd = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    const right = { x: -Math.sin(this.angle), y: Math.cos(this.angle) };
    let forwardSpeed = this.vx * fwd.x + this.vy * fwd.y;
    let lateralSpeed = this.vx * right.x + this.vy * right.y;

    if (controls.forward) {
      forwardSpeed += this.acceleration * g * dt;
    } else if (controls.backward) {
      // Braking (fast) while still rolling forward, reversing (slower) once stopped
      const decel = forwardSpeed > 0 ? this.brakingForce : this.acceleration;
      forwardSpeed -= decel * g * dt;
    } else {
      const drag = this.coastFriction * dt;
      if (forwardSpeed > 0) forwardSpeed = Math.max(0, forwardSpeed - drag);
      else if (forwardSpeed < 0) forwardSpeed = Math.min(0, forwardSpeed + drag);
    }

    const offTrackDrag = this.maxOffTrackDrag * (1 - g) * dt;
    if (forwardSpeed > 0) forwardSpeed = Math.max(0, forwardSpeed - offTrackDrag);
    else if (forwardSpeed < 0) forwardSpeed = Math.min(0, forwardSpeed + offTrackDrag);

    forwardSpeed = clamp(forwardSpeed, this.maxReverseSpeed, this.maxSpeed);

    // Tires resist sideways sliding - frame-rate-independent exponential
    // decay toward zero. Low grip (e.g. grass) decays much more slowly, so
    // the car keeps sliding instead of snapping straight.
    lateralSpeed *= Math.exp(-this.gripStrength * g * dt);

    this.vx = fwd.x * forwardSpeed + right.x * lateralSpeed;
    this.vy = fwd.y * forwardSpeed + right.y * lateralSpeed;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.speed = Math.hypot(this.vx, this.vy);
  }

  // Angle the car is actually moving, as opposed to the way it's pointed
  // (this.angle) - the gap between the two is the drift/slip angle.
  get travelAngle(): number {
    return Math.atan2(this.vy, this.vx);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const length = 24;
    const width = 12;

    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(-length / 2, -width / 2, length, width);

    // White nose marker so facing direction is visible at a glance
    ctx.fillStyle = '#fff';
    ctx.fillRect(length / 2 - 4, -width / 2, 4, width);

    ctx.restore();
  }
}
