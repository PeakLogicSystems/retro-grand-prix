import type { GhostFrame } from './ghost';

const TIMES_KEY = 'retro-grand-prix:best-times';
const ghostKey = (trackName: string): string => `retro-grand-prix:ghost:${trackName}`;

// Best lap TIMES are tiny (one number per track) and needed on the track
// select menu for every track at once, so they're stored separately from
// ghost RECORDINGS (hundreds of position samples) - showing the menu
// shouldn't require loading and parsing every track's full replay data.

export function loadBestTimes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TIMES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function saveBestTime(trackName: string, lapTime: number): void {
  try {
    const times = loadBestTimes();
    times[trackName] = lapTime;
    localStorage.setItem(TIMES_KEY, JSON.stringify(times));
  } catch {
    // localStorage can fail (private browsing, quota) - losing a saved time isn't critical
  }
}

export function loadGhost(trackName: string): GhostFrame[] | null {
  try {
    const raw = localStorage.getItem(ghostKey(trackName));
    return raw ? (JSON.parse(raw) as GhostFrame[]) : null;
  } catch {
    return null;
  }
}

export function saveGhost(trackName: string, frames: GhostFrame[]): void {
  try {
    localStorage.setItem(ghostKey(trackName), JSON.stringify(frames));
  } catch {
    // ignore - same reasoning as saveBestTime
  }
}

export function clearBest(trackName: string): void {
  try {
    const times = loadBestTimes();
    delete times[trackName];
    localStorage.setItem(TIMES_KEY, JSON.stringify(times));
    localStorage.removeItem(ghostKey(trackName));
  } catch {
    // ignore - same reasoning as saveBestTime
  }
}
