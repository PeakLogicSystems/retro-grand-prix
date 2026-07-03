import type { TrackDefinition } from './track';
import { loadBestTimes } from './storage';

export interface StandingEntry {
  track: TrackDefinition;
  bestLapTime: number | null;
  points: number;
}

// Proportional to how your best lap compares to the track's par time -
// beat par and you score over 1000, fall short and you score under.
// Simple and easy to reason about; there's no real-opponent data to
// calibrate against since this is solo time trial.
export function pointsForTrack(parLapTime: number, bestLapTime: number | null): number {
  if (bestLapTime === null || bestLapTime <= 0) return 0;
  return Math.max(0, Math.round((parLapTime / bestLapTime) * 1000));
}

export function getStandings(tracks: TrackDefinition[]): StandingEntry[] {
  const times = loadBestTimes();
  return tracks.map((track) => {
    const bestLapTime = times[track.name] ?? null;
    return { track, bestLapTime, points: pointsForTrack(track.parLapTime, bestLapTime) };
  });
}

export function getTotalPoints(tracks: TrackDefinition[]): number {
  return getStandings(tracks).reduce((sum, entry) => sum + entry.points, 0);
}
