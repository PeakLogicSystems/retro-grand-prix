export class InputManager {
  private readonly pressed = new Set<string>();

  constructor() {
    // event.code is the physical key ("KeyW"), unaffected by keyboard layout
    // or the Shift key - event.key would give "w" or "W" depending on both.
    window.addEventListener('keydown', (e) => this.pressed.add(e.code));
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
  }

  isDown(code: string): boolean {
    return this.pressed.has(code);
  }
}
