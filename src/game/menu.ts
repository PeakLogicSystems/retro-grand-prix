import type { TrackDefinition } from './track';

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
  ctx.fillText('RETRO GRAND PRIX', canvas.width / 2, 100);

  ctx.fillStyle = '#aaa';
  ctx.font = '20px monospace';
  ctx.fillText('Select a track', canvas.width / 2, 150);

  const startY = 230;
  const lineHeight = 50;
  tracks.forEach((track, i) => {
    const y = startY + i * lineHeight;
    const selected = i === selectedIndex;
    ctx.fillStyle = selected ? '#4fc3f7' : '#888';
    ctx.font = selected ? 'bold 26px monospace' : '22px monospace';
    ctx.fillText((selected ? '> ' : '  ') + track.name, canvas.width / 2, y);
  });

  ctx.fillStyle = '#666';
  ctx.font = '16px monospace';
  ctx.fillText('Up/Down or W/S to choose - Enter or Space to start', canvas.width / 2, canvas.height - 60);
}
