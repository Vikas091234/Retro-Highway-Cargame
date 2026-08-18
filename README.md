# Retro Highway

**Retro Highway** is a browser-based retro-style endless highway game built with HTML5 Canvas, CSS, and vanilla JavaScript.

The project combines a pattern-driven traffic system with player-behaviour tracking and adaptive difficulty. Instead of relying only on random traffic placement, the game generates constrained traffic patterns, checks whether a reachable path exists, and changes later patterns according to observed player lane preferences and camping behaviour.

> **Development note:** The implementation was developed with substantial assistance from large language models (LLMs). The LLMs were used as coding assistance for implementation and iteration; the project logic, feature selection, integration, testing, and final organization were performed as part of the project development process. This repository documents the resulting implementation rather than claiming that all code was written manually without AI assistance.

## Features

- 8-lane endless highway gameplay
- Keyboard controls using the left/right arrow keys
- Progressive difficulty based on score
- Pattern-based traffic generation
- Reachability/accessibility checks for generated patterns
- Player lane-preference tracking
- Camping-tendency detection
- Adaptive traffic placement
- Anti-camping logic
- Speed variation for traffic vehicles
- Collision-aware traffic speed adjustment
- Intelligent-driver-model-style traffic update logic
- Persistent high score using browser `localStorage`
- Music selection, pause/resume, and volume control
- Retro pixel-art presentation
- Settings and restart/home flow

## How the Game Works

The game loop is divided into three broad stages:

```text
Player input
    ↓
Player behaviour tracking
    ↓
Traffic pattern generation
    ↓
Pattern accessibility checks
    ↓
Traffic spawning and movement
    ↓
Collision detection
    ↓
Score / difficulty update
    ↓
Next frame
```

### 1. Player behaviour tracking

The game periodically records the player's current lane and maintains short histories of:

- lane usage
- recent movements
- recent positions
- camping tendency
- adaptive score

These values are used by the traffic generator after the early part of the game.

### 2. Adaptive pattern generation

`generateAdaptivePattern()` creates a traffic pattern for the current player state.

The generator considers:

- current player lane
- preferred side of the road
- least-used lanes
- current score
- recent gap density
- permitted movement range
- whether the player appears to be camping

The generated pattern is then passed through accessibility constraints.

### 3. Accessibility and anti-camping

The game does not simply accept every random pattern.

`enforceMovementConstraints()` checks whether at least one gap remains reachable within the player's allowed lane movement range.

The project also contains:

- `ensureGapContinuity()`
- `forcePatternAccessibility()`
- `validatePatternAccessibility()`
- `applyAntiCampingMeasures()`

These functions are intended to prevent impossible or excessively repetitive patterns while still increasing difficulty.

### 4. Traffic movement

Traffic speed is affected by both global difficulty and local vehicle interactions.

The implementation includes:

- score-based speed scaling
- per-vehicle speed variation
- collision-aware spacing adjustments
- IDM-style acceleration/update logic

This lets traffic move with more varied behaviour than a single constant speed.

## Controls

| Action | Control |
|---|---|
| Move left | `←` |
| Move right | `→` |
| Start | Start button |
| Restart | Restart button |
| Pause / settings | Settings button |
| Volume | Volume button |

## Technologies

- **HTML5 Canvas** — game rendering
- **Vanilla JavaScript** — game logic and state management
- **CSS** — interface and retro styling
- **Web Storage API / localStorage** — high score and preference persistence
- **Google Fonts** — Press Start 2P display font
- **Audio files** — background music

No frontend framework is required.

## Repository Structure

```text
Retro-Highway/
├── index.html
├── style.css
├── game.js
├── README.md
├── REPORT.md
│
├── audio/
│   ├── Audioinsmusic - Basscape.mp3
│   ├── Audioinsmusic - Driftline.mp3
│   └── Audioinsmusic - Groovoid.mp3
│
└── images/
    ├── highway.png
    ├── player_images/
    ├── sidewalk_images/
    └── traffic_images/
```

`game.js` is the main implementation file.

## Running Locally

No build system is required.

1. Clone or download the repository.
2. Open `index.html` in a modern browser.

For the most reliable behaviour, serve the directory with a small local HTTP server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Main Source Modules

### `game.js`

Contains the complete game logic, including:

- game state
- player state
- traffic state
- behaviour tracking
- adaptive pattern generation
- accessibility checks
- traffic movement
- collision detection
- rendering
- audio/settings controls
- animation loop

Important functions include:

```text
updatePlayerBehavior()
generateAdaptivePattern()
generateVehiclePositions()
enforceMovementConstraints()
applyAntiCampingMeasures()
ensureGapContinuity()
forcePatternAccessibility()
validatePatternAccessibility()
manageTrafficFlow()
spawnTrafficRow()
updateIDM()
checkCollision()
updateEnemies()
updatePlayer()
loop()
```

## AI-Assisted Development

LLMs were used as coding assistants during development.

The use of LLMs included code generation, iteration, debugging support, refactoring ideas, and implementation assistance. The resulting repository should therefore be understood as an **AI-assisted software project**, not as a claim of fully manual code authorship.

The important engineering work in the project includes deciding the intended game mechanics, integrating generated code into a working browser application, identifying and refining adaptive traffic behaviour, testing gameplay logic, and maintaining a consistent project structure.

## Limitations and Known Design Characteristics

- The game is a client-side browser game and has no backend.
- Traffic generation is stochastic, so individual runs differ.
- Behaviour adaptation is intentionally lightweight and heuristic rather than based on a trained machine-learning model.
- The adaptive system uses hand-designed rules and thresholds.
- The game currently targets keyboard desktop play.
- Audio and image assets are loaded locally from the repository.

## Credits

**Developer:** Vikas Raj

**Music:** Audioinsmusic

## License / Asset Note

No license is currently declared for the included music or image assets. Before distributing the repository publicly, verify that the assets are permitted for redistribution and add an appropriate license file if applicable.
