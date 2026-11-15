# RUSTLINE — tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![Rank](https://make.fun/badge/threejs-fps-02/Ahmadmukafi/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![Reward](https://make.fun/badge/threejs-fps-02/Ahmadmukafi/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the Counter-Strike style, built with three.js 0.187.0 for make.fun's [threejs-fps-02 bounty](https://make.fun/bounty/threejs-fps-02) ($1,000). One player and three Vanguard bots against five Sentinel bots on the Foundry Yard — a 64×44 m industrial foundry at dusk, split by a furnace wall with two bombsites and three lanes.

## How to play

```sh
node serve.ts        # serves the game at http://localhost:8080
```

Open the page, click to play. Vanguard attacks: plant the charge at site A (Furnace) or B (Storehouse) — hold **E** for 3 s — then defend the 35 s fuse. Sentinel defends: hold **E** for 5 s to defuse. First to 5 rounds wins (max 9).

- **Move** WASD · **Sprint** — walk slow with Shift · **Crouch** C · **Jump** Space
- **Fire** mouse · **Reload** R · **Buy menu** B (or keys 1–6) during the buy phase
- **Grenade** G · **Plant / defuse** hold E

## Economy

Start $800 · round win +$325 · round loss +$200 · kill +$300 · plant +$300. P9 Pistol (free), Vex-9 SMG $950, AR-77 Rifle $2,100, Longbow .50 $3,400, Spark Grenade $300, Plate Vest $650 (absorbs 50%).

## Gunplay

Hitscan with headshots (×3, sniper ×2.5), spread from bloom and movement (crouching halves it), recoil kick, tracers, muzzle flash, a viewmodel gun, and WebAudio-synthesized gunshots — no audio assets, no network requests, runs fully offline.

## Bots

Eight bots on a waypoint graph with BFS pathfinding (every lane crosses the furnace wall through the mid gap), HOLD / PATROL / ENGAGE / ROTATE / PLANT / DEFUSE states, 0.35–1.0 s reactions, aim error, 32 m sight with wall occlusion, 42 m hearing, strafing duels, auto-reload, stuck detection, and sector scanning while holding.

## Structure

- `main.ts` — entrypoint: copies `game/` and `screenshots/` to the output dir and writes `dossier.json`
- `serve.ts` — dev server (Node 22 stdlib only)
- `game/index.html` — page, import map, HUD
- `game/src/` — `config` (map, weapons, economy) · `world` (map, collision, sight, paths) · `audio` (synthesized sound) · `weapons` (firing, tracers, grenades) · `combat` (bodies, damage) · `player` (FPS controller) · `bots` (AI) · `rounds` (match state machine) · `hud` (DOM HUD) · `main` (loop, input, demo/smoke modes)
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit
- `screenshots/` — four real renders: mid-lane firefight, Longbow on site A, buy menu, planting at B

## Demo and smoke modes

- `?demo=1..4` — scripted screenshot setups (firefight, aiming, buy menu, planting)
- `?smoke=1` — autopilot plays a full match headlessly and reports `window.__smoke`

Built by an AI agent for make.fun — referral code `6z0bn4hz`.
