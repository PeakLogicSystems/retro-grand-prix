// On-screen touch controls for tablets: steering buttons on the left,
// throttle/brake on the right. Uses the Pointer Events API rather than raw
// touch events because it unifies mouse/touch/pen handling and, more
// importantly, works the same way whether the browser reports a touch or a
// mouse - one code path instead of two.
export interface TouchButton {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export type TouchZone = 'steerLeft' | 'steerRight' | 'throttle' | 'brake';

export interface TouchControlLayout {
  steerLeft: TouchButton;
  steerRight: TouchButton;
  throttle: TouchButton;
  brake: TouchButton;
}

const BUTTON_SIZE = 90;
const MARGIN = 20;
const GAP = 12;

// Steering pair sits low on the left (natural left-thumb position holding a
// tablet in landscape); throttle/brake stack low on the right - matches the
// split the game is meant to teach: left hand steers, right hand controls
// speed.
export function getTouchControlLayout(canvas: HTMLCanvasElement): TouchControlLayout {
  const brake: TouchButton = {
    x: canvas.width - MARGIN - BUTTON_SIZE,
    y: canvas.height - MARGIN - BUTTON_SIZE,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    label: '▼',
  };
  const throttle: TouchButton = {
    x: brake.x,
    y: brake.y - GAP - BUTTON_SIZE,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    label: '▲',
  };
  const steerLeft: TouchButton = {
    x: MARGIN,
    y: canvas.height - MARGIN - BUTTON_SIZE,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    label: '◀',
  };
  const steerRight: TouchButton = {
    x: MARGIN + BUTTON_SIZE + GAP,
    y: canvas.height - MARGIN - BUTTON_SIZE,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    label: '▶',
  };
  return { steerLeft, steerRight, throttle, brake };
}

function pointInButton(x: number, y: number, b: TouchButton): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

function zoneAt(layout: TouchControlLayout, x: number, y: number): TouchZone | null {
  if (pointInButton(x, y, layout.steerLeft)) return 'steerLeft';
  if (pointInButton(x, y, layout.steerRight)) return 'steerRight';
  if (pointInButton(x, y, layout.throttle)) return 'throttle';
  if (pointInButton(x, y, layout.brake)) return 'brake';
  return null;
}

// Tracks every active pointer by ID rather than a single "is touching"
// flag, because driving needs at least two fingers down at once (steering
// with one hand, throttle with the other) - a single shared boolean would
// make the second touch cancel the first.
export class TouchDriveControls {
  private readonly pointerZones = new Map<number, TouchZone>();
  private readonly canvas: HTMLCanvasElement;
  private readonly getLayout: () => TouchControlLayout;

  constructor(canvas: HTMLCanvasElement, getLayout: () => TouchControlLayout) {
    this.canvas = canvas;
    this.getLayout = getLayout;
    // Without this, the browser treats a drag on the canvas as a page-scroll
    // or pinch-zoom gesture, which fights with holding a button down.
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => this.updatePointer(e));
    canvas.addEventListener('pointermove', (e) => this.updatePointer(e));
    canvas.addEventListener('pointerup', (e) => this.pointerZones.delete(e.pointerId));
    canvas.addEventListener('pointercancel', (e) => this.pointerZones.delete(e.pointerId));
    canvas.addEventListener('pointerleave', (e) => this.pointerZones.delete(e.pointerId));
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * this.canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * this.canvas.height) / rect.height;
    const zone = zoneAt(this.getLayout(), x, y);
    if (zone) this.pointerZones.set(e.pointerId, zone);
    else this.pointerZones.delete(e.pointerId);
  }

  private isZoneActive(zone: TouchZone): boolean {
    for (const z of this.pointerZones.values()) {
      if (z === zone) return true;
    }
    return false;
  }

  get forward(): boolean {
    return this.isZoneActive('throttle');
  }
  get backward(): boolean {
    return this.isZoneActive('brake');
  }
  get left(): boolean {
    return this.isZoneActive('steerLeft');
  }
  get right(): boolean {
    return this.isZoneActive('steerRight');
  }

  activeZones(): Set<TouchZone> {
    return new Set(this.pointerZones.values());
  }
}

export function renderTouchControls(
  ctx: CanvasRenderingContext2D,
  layout: TouchControlLayout,
  active: Set<TouchZone>
): void {
  const buttons: [TouchButton, TouchZone][] = [
    [layout.steerLeft, 'steerLeft'],
    [layout.steerRight, 'steerRight'],
    [layout.throttle, 'throttle'],
    [layout.brake, 'brake'],
  ];

  for (const [b, zone] of buttons) {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const radius = Math.min(b.width, b.height) / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = active.has(zone) ? 'rgba(150, 150, 150, 0.5)' : 'rgba(120, 120, 120, 0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, cx, cy + 2);
    ctx.textBaseline = 'alphabetic';
  }
}
