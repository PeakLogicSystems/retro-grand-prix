import type { TrackDefinition } from './track';
import { getStandings, getTotalPoints } from './championship';

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

  const standings = getStandings(tracks);

  const startY = 200;
  const lineHeight = 55;
  standings.forEach((entry, i) => {
    const y = startY + i * lineHeight;
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
