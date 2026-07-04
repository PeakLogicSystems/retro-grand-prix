import type { TrackDefinition } from './track';
import { getStandings, getTotalPoints } from './championship';

// Shared with getMenuEntryIndexAt below, so a tap always lands on the same
// row the renderer drew it at - the same "one layout, two consumers"
// pattern used for the race-view buttons in main.ts.
export const MENU_START_Y = 200;
export const MENU_LINE_HEIGHT = 55;

export function renderTrackSelectMenu(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  tracks: TrackDefinition[],
  selectedIndex: number
): void {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';

  ctx.fillStyle = '#4fc3f7';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('RETRO GRAND PRIX', canvas.width / 2, 90);

  ctx.fillStyle = '#aaa';
  ctx.font = '20px monospace';
  ctx.fillText('Select a track', canvas.width / 2, 135);
  ctx.font = '14px monospace';
  ctx.fillText('(tap a track to play, or use Up/Down + Enter)', canvas.width / 2, 158);

  const standings = getStandings(tracks);

  standings.forEach((entry, i) => {
    const y = MENU_START_Y + i * MENU_LINE_HEIGHT;
    const selected = i === selectedIndex;

    ctx.fillStyle = selected ? '#4fc3f7' : '#888';
    ctx.font = selected ? 'bold 24px monospace' : '20px monospace';
    ctx.fillText((selected ? '> ' : '  ') + entry.track.name, canvas.width / 2, y);

    ctx.fillStyle = selected ? '#9ad9f7' : '#555';
    ctx.font = '14px monospace';
    const best = entry.bestLapTime !== null ? `${entry.bestLapTime.toFixed(2)}s` : '--';
    ctx.fillText(`best: ${best}   points: ${entry.points}`, canvas.width / 2, y + 20);
  });

  ctx.fillStyle = '#4fc3f7';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`Championship total: ${getTotalPoints(tracks)}`, canvas.width / 2, canvas.height - 90);

  ctx.fillStyle = '#666';
  ctx.font = '16px monospace';
  ctx.fillText('Up/Down or W/S to choose - Enter or Space to start', canvas.width / 2, canvas.height - 60);
  ctx.fillStyle = '#a55';
  ctx.fillText('[R] reset best time + ghost for selected track', canvas.width / 2, canvas.height - 38);
}

// Which track entry (if any) a tap/click at height y landed on - hit zones
// span the row's full height regardless of x, since a mobile list tap
// doesn't need horizontal precision. For touch devices, tapping a specific
// row directly is natural and there's no need to make the player navigate
// there with arrow keys first.
export function getMenuEntryIndexAt(y: number, numEntries: number): number | null {
  for (let i = 0; i < numEntries; i++) {
    const centerY = MENU_START_Y + i * MENU_LINE_HEIGHT;
    const halfHeight = MENU_LINE_HEIGHT / 2 - 4;
    if (y >= centerY - halfHeight && y <= centerY + halfHeight) return i;
  }
  return null;
}
