const GAME_KEYS_LIST = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyV',
  'KeyG',
  'KeyR',
  'Enter',
  'Space',
  'Escape',
];
const GAME_KEYS = new Set(GAME_KEYS_LIST);

// Some environments (remote desktop/VM input redirection, certain
// keyboards) don't forward a true "held" state - they resend discrete
// down+up pairs every ~100ms to simulate a hold instead of one down
// followed by repeat=true events. So instead of trusting keyup, a key
// counts as "down" until this long has passed since its last keydown.
const RELEASE_GRACE_MS = 150;

export class InputManager {
  private readonly lastDownAt = new Map<string, number>();
  private readonly consumed = new Set<string>();

  constructor() {
    // event.code is the physical key ("KeyW"), unaffected by keyboard layout
    // or the Shift key - event.key would give "w" or "W" depending on both.
    window.addEventListener('keydown', (e) => {
      this.lastDownAt.set(e.code, performance.now());
      // Stop arrow keys/WASD from scrolling the page or triggering other defaults
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    });
  }

  isDown(code: string): boolean {
    const last = this.lastDownAt.get(code);
    return last !== undefined && performance.now() - last < RELEASE_GRACE_MS;
  }

  // Edge-triggered: true only on the first check after a key goes down,
  // regardless of how long it's held - for toggle actions (like switching
  // views) where isDown() would fire every frame the key is held instead of
  // once per press.
  consumePress(code: string): boolean {
    const down = this.isDown(code);
    if (down && !this.consumed.has(code)) {
      this.consumed.add(code);
      return true;
    }
    if (!down) {
      this.consumed.delete(code);
    }
    return false;
  }

  debugSnapshot(): string {
    return GAME_KEYS_LIST.filter((code) => this.isDown(code)).join(', ');
  }
}
