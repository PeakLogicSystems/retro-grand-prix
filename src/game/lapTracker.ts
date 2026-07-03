import type { Point } from './track';

// Requires reaching checkpoints in order (not just crossing the start line)
// so driving backward through the finish, or cutting across the infield,
// can't be used to fake a lap.
export class LapTracker {
  private readonly checkpoints: Point[];
  private readonly radius: number;
  private nextCheckpoint = 0;
  private started = false;

  currentLapTime = 0;
  bestLapTime: number | null = null;
  lapCount = 0;

  constructor(checkpoints: Point[], radius: number) {
    this.checkpoints = checkpoints;
    this.radius = radius;
  }

  update(dt: number, carX: number, carY: number): void {
    if (this.started) {
      this.currentLapTime += dt;
    }

    const target = this.checkpoints[this.nextCheckpoint];
    if (Math.hypot(carX - target.x, carY - target.y) > this.radius) return;

    if (this.nextCheckpoint === 0) {
      if (this.started) {
        this.lapCount++;
        if (this.bestLapTime === null || this.currentLapTime < this.bestLapTime) {
          this.bestLapTime = this.currentLapTime;
        }
      }
      this.started = true;
      this.currentLapTime = 0;
    }

    this.nextCheckpoint = (this.nextCheckpoint + 1) % this.checkpoints.length;
  }
}
