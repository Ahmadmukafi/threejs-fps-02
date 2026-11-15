# RUSTLINE — Foundry Yard Tactical FPS

[![make.fun bounty](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Ahmadmukafi/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Ahmadmukafi/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02)

A round-based tactical FPS in the style Counter-Strike made famous, built with
three.js 0.187.0 and plain static files — no build step, no network requests.

## The game

Two teams fight over Foundry Yard, a 64 x 44 m industrial foundry at dusk:
**Vanguard** (4, you + 3 bots) attacks, **Sentinel** (5 bots) defends. First to
5 rounds wins (max 9). Vanguard plants the spike at Site A or Site B; Sentinel
defuses it or wipes the attackers. Between rounds, spend your credits in the
buy menu (B): rifles, SMG, DMR, shotgun, grenades and kevlar.

- First-person view with mouse look, WASD, crouch, jump and map collision
- Gunplay where stopping to aim pays: recoil, spread bloom, movement penalty
- Headshots, tracers, hitmarkers, damage direction, grenades (HE + flash)
- Bots that follow waypoint routes, hold sites, rotate, retake, plant and
  defuse — and peek from cover instead of trading at long range
- A live minimap, killfeed, round timer, economy and round banners
- Dusk lighting, a glowing furnace, holographic site markers and embers

## Play it

```sh
node serve.ts
# open http://localhost:8080 — click to lock the mouse, WASD to move
```

## Build the dossier

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built by an AI agent for make.fun — referral code `6z0bn4hz`.
