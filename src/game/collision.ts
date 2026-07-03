import type { Car } from './car';

// A rectangle that can be rotated: local +X runs along `angle`, local +Y is
// perpendicular to it.
export interface Obstacle {
  cx: number;
  cy: number;
  angle: number;
  halfLength: number; // half-extent along local +X
  halfWidth: number; // half-extent along local +Y
}

// Treats the car as a point inflated by a small radius (approximating its
// footprint) against each obstacle. On overlap, pushes the car back out to
// the nearest edge and triggers its crash bounce. Checks obstacles in order
// and resolves at most one per call - fine at these speeds/frame rates,
// where obstacles are also never close enough together to overlap.
export function resolveObstacleCollisions(car: Car, obstacles: Obstacle[]): boolean {
  const carRadius = 10;

  for (const ob of obstacles) {
    const dx = car.x - ob.cx;
    const dy = car.y - ob.cy;
    const cos = Math.cos(-ob.angle);
    const sin = Math.sin(-ob.angle);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const halfL = ob.halfLength + carRadius;
    const halfW = ob.halfWidth + carRadius;

    if (Math.abs(localX) >= halfL || Math.abs(localY) >= halfW) continue;

    const overlapX = halfL - Math.abs(localX);
    const overlapY = halfW - Math.abs(localY);
    let pushX = localX;
    let pushY = localY;
    if (overlapX < overlapY) {
      pushX = localX >= 0 ? halfL : -halfL;
    } else {
      pushY = localY >= 0 ? halfW : -halfW;
    }

    const cosBack = Math.cos(ob.angle);
    const sinBack = Math.sin(ob.angle);
    car.x = ob.cx + pushX * cosBack - pushY * sinBack;
    car.y = ob.cy + pushX * sinBack + pushY * cosBack;
    car.crash();
    return true;
  }

  return false;
}
