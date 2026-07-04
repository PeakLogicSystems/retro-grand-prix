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

  // Speeds and turn rate lowered from earlier, faster values - reaction
  // time matters even more in the cockpit view, and the car was generally
  // too twitchy to hold a line, overcompensating into spins from small
  // steering inputs.
  private readonly maxSpeed = 225;
  private readonly maxReverseSpeed = -100;
  private readonly acceleration = 190;
  private readonly brakingForce = 320;
  private readonly coastFriction = 140;
  private readonly turnRate = Math.PI * 0.5;
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

    // Low grip (e.g. grass) caps the speed it can *sustain* rather than
    // fighting the accelerator outright. Earlier this was a flat drag force
    // that could exceed the grip-reduced acceleration, making net
    // acceleration negative - the car could never regain enough speed to
    // steer back onto the track and got permanently stuck. Capping instead
    // (bleeding excess speed down gradually, but never blocking the climb
    // back up to the cap) guarantees recovery is always possible.
    const forwardCap = this.maxSpeed * g;
    const reverseCap = this.maxReverseSpeed * g;
    if (forwardSpeed > forwardCap) {
      forwardSpeed = Math.max(forwardCap, forwardSpeed - this.maxOffTrackDrag * dt);
    } else if (forwardSpeed < reverseCap) {
      forwardSpeed = Math.min(reverseCap, forwardSpeed + this.maxOffTrackDrag * dt);
    }

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

  // Called when hitting a solid obstacle (guardrail, stand, building).
  // Bounces back at a fraction of impact speed - a firm stop that reads as
  // a crash, and small enough to not immediately re-penetrate the obstacle.
  crash(): void {
    this.vx *= -0.25;
    this.vy *= -0.25;
    this.speed = Math.hypot(this.vx, this.vy);
  }

  render(ctx: CanvasRenderingContext2D): void {
    renderF1Silhouette(ctx, this.x, this.y, this.angle, '#4fc3f7');
  }
}

// A top-down F1-style silhouette: pointed nose, bulging side pods, tapered
// tail, and separate front/rear wings - drawn once and shared by both the
// player's car and its ghost, so the two always look alike.
function renderF1Silhouette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  bodyColor: string
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Body outline, nose at +x - traced as one half then mirrored for symmetry.
  const upperProfile: [number, number][] = [
    [12, 0],
    [9, 2],
    [6, 2.5],
    [2, 5],
    [-4, 5.5],
    [-9, 3],
    [-12, 2.5],
  ];

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(upperProfile[0][0], upperProfile[0][1]);
  for (const [px, py] of upperProfile.slice(1)) ctx.lineTo(px, py);
  for (const [px, py] of [...upperProfile].reverse()) ctx.lineTo(px, -py);
  ctx.closePath();
  ctx.fill();

  // Front and rear wings - thin bars wider than the body
  ctx.fillStyle = '#222';
  ctx.fillRect(10, -6, 2, 12);
  ctx.fillRect(-12, -7, 2, 14);

  // Cockpit opening, with the driver's white helmet visible inside it
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(1, 0, 2.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(1, 0, 1.3, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Same silhouette as Car.render, but translucent and colorless - for
// drawing the ghost of the player's own best lap alongside the real car.
export function renderGhostCar(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  renderF1Silhouette(ctx, x, y, angle, '#fff');
  ctx.restore();
}
