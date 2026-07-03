import './style.css';

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #game-canvas in index.html');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('2D rendering context is not supported in this browser');
}

ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);

ctx.fillStyle = '#0f0';
ctx.font = '32px monospace';
ctx.textAlign = 'center';
ctx.fillText('RETRO GRAND PRIX', canvas.width / 2, canvas.height / 2 - 20);

ctx.fillStyle = '#888';
ctx.font = '16px monospace';
ctx.fillText('Milestone 0: canvas pipeline is working', canvas.width / 2, canvas.height / 2 + 20);
