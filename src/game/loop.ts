export type UpdateFn = (dt: number) => void;
export type RenderFn = () => void;

export function startGameLoop(update: UpdateFn, render: RenderFn): void {
  let lastTime = performance.now();

  function frame(now: number): void {
    // Clamp dt so a dropped/backgrounded frame can't cause a huge physics jump
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;

    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
