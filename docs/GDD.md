# Retro Grand Prix — Game Design Document

Living source-of-truth for scope. Anything not listed here is out of
scope until this doc is updated first.

## Concept

A 2D retro-style single-player F1-inspired racing game. Player picks a
track, drives against the clock, chases their best lap time / a ghost
of their best run, and earns championship points across a season of
tracks.

## Legal note

No real F1 team names, sponsor logos, or exact real-world circuit
layouts. Tracks are original, fictional circuits "inspired by" real
locations (e.g. a Monaco-inspired street circuit), same approach used
by classic retro racers like *Out Run* and *Top Gear*.

## Platform & stack

- Browser game: TypeScript + HTML5 Canvas (2D context)
- No game framework initially — hand-rolled game loop
- Build tool: Vite

## Views

- Overhead (top-down)
- Cockpit (driver's-eye view)
- Switchable during a race

## Controls

Keyboard only for MVP: steer, accelerate, brake (arrow keys / WASD).

## Physics

Semi-sim: simplified tire grip/slip and momentum-based cornering. Not
full simulation, not arcade bumper-cars.

## Progression

- Best-lap time per track, saved locally
- Ghost replay of the player's own best lap
- Championship points totaled across tracks in a season

## Opponents

None. Solo time trial only — no AI-driven cars, no car-vs-car
collision.

## MVP (what "done" means for v1)

- 1 track
- Overhead view only
- Working car physics
- Lap timer
- Best lap saved locally

## Stretch goals (explicitly NOT in MVP)

- Cockpit view
- Multiple tracks + track select screen
- Ghost replay
- Championship/season points across tracks
- Sound, CRT/scanline retro visual filter, gamepad support

## Build roadmap

| # | Milestone | Concepts |
|---|-----------|----------|
| 0 | Project scaffold | Build tooling, TypeScript config, project structure |
| 1 | Game loop + drivable car on blank canvas | Game loop, delta time, keyboard input |
| 2 | Track with boundaries + lap timing | Collision detection, checkpoints/waypoints |
| 3 | Real car physics | Vectors, basic physics simulation |
| 4 | Cockpit view | Camera transforms, retro pseudo-3D tricks |
| 5 | Track select + multiple tracks | Game states/screens, data-driven design |
| 6 | Ghost replay + championship points | Data persistence (localStorage) |
| 7 | Polish + deploy | Audio, visual effects, shipping to a URL |
