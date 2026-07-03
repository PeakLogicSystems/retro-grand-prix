import type { Point } from './track';

export interface LapUpdateResult {
  completedLap: boolean;
  isNewBest: boolean;
  completedLapTime: number | null;
}

// Requires reaching checkpoints in order (not just crossing the start line)
// so driving backward through the finish, or cutting across the infield,
// can't be used to fake a lap.
export class LapTracker {
  private readonly checkpoints: Point[];
  private readonly radius: number;
  private nextCheckpoint = 0;
  private started = false;

  currentLapTime = 0;
  bestLapTime: number | null;
  lapCount = 0;

  constructor(checkpoints: Point[], radius: number, initialBestLapTime: number | null = null) {
    this.checkpoints = checkpoints;
    this.radius = radius;
    this.bestLapTime = initialBestLapTime;
  }

  update(dt: number, carX: number, carY: number): LapUpdateResult {
    if (this.started) {
      this.currentLapTime += dt;
    }

    const target = this.checkpoints[this.nextCheckpoint];
    if (Math.hypot(carX - target.x, carY - target.y) > this.radius) {
      return { completedLap: false, isNewBest: false, completedLapTime: null };
    }

    let result: LapUpdateResult = { completedLap: false, isNewBest: false, completedLapTime: null };

    if (this.nextCheckpoint === 0) {
      if (this.started) {
        this.lapCount++;
        const isNewBest = this.bestLapTime === null || this.currentLapTime < this.bestLapTime;
        if (isNewBest) this.bestLapTime = this.currentLapTime;
        result = { completedLap: true, isNewBest, completedLapTime: this.currentLapTime };
      }
      this.started = true;
      this.currentLapTime = 0;
    }

    this.nextCheckpoint = (this.nextCheckpoint + 1) % this.checkpoints.length;
    return result;
  }
}
