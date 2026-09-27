SNIPER OPS // V4

A lightweight 3D browser sniper game containing the complete V1-V4 feature path.

FEATURES

V1 - Sniper Training Range
- Pine Valley map
- Stationary steel targets
- Scope, firing, hit scoring and reloads

V2 - Realistic Ballistics
- Red Canyon map with long-range targets
- Physical bullet travel, velocity, gravity and wind drift
- Adjustable elevation and windage in 0.2 MIL steps

V3 - AI Mission
- Blackwood night map
- Patrol routes, vision/detection, alert behavior and return fire
- Stealth and elimination objectives

V4 - Full 3D Game
- Four maps and four selectable operations
- Three rifles with different damage, velocity, stability and magazines
- XP, levels, credits, weapon unlocks, best scores and completion tracking
- Pause, mission debrief, restart and persistent local save system

HOW TO RUN

Windows:
1. Double-click run_server.bat
2. Open http://localhost:8000

PowerShell:
1. Open PowerShell in this folder
2. Run .\run_server.ps1

Linux / macOS:
1. Run ./run_server.sh
2. Open http://localhost:8000

CONTROLS

WASD          Move
Mouse         Aim
Left click    Fire
Right click   Hold scope
R             Reload
Shift         Hold breath / steady aim
Up / Down     Adjust scope elevation
Left / Right  Adjust scope windage
Esc           Pause / release mouse

NOTES

- Internet access is required when the page first loads because Three.js is loaded from a CDN.
- Progress is saved automatically in the browser's local storage.
- Keep the server window open while playing. Press CTRL+C there to stop it.
