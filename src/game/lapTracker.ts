import type { Point } from './track';

export interface LapUpdateResult {
  reachedCheckpoint: boolean;
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
      return { reachedCheckpoint: false, completedLap: false, isNewBest: false, completedLapTime: null };
    }

    let result: LapUpdateResult = {
      reachedCheckpoint: true,
      completedLap: false,
      isNewBest: false,
      completedLapTime: null,
    };

    if (this.nextCheckpoint === 0) {
      if (this.started) {
        this.lapCount++;
        const isNewBest = this.bestLapTime === null || this.currentLapTime < this.bestLapTime;
        if (isNewBest) this.bestLapTime = this.currentLapTime;
        result = { reachedCheckpoint: true, completedLap: true, isNewBest, completedLapTime: this.currentLapTime };
      }
      this.started = true;
      this.currentLapTime = 0;
    }

    this.nextCheckpoint = (this.nextCheckpoint + 1) % this.checkpoints.length;
    return result;
  }

  // One entry per non-start checkpoint (index 1..n-1), true once the car
  // has passed it since the last start/finish crossing - resets to all
  // false the moment a lap completes, since nextCheckpoint wraps back to 1.
  getCheckpointStatus(): boolean[] {
    const status: boolean[] = [];
    for (let i = 1; i < this.checkpoints.length; i++) {
      status.push(this.started && (this.nextCheckpoint > i || this.nextCheckpoint === 0));
    }
    return status;
  }
}
