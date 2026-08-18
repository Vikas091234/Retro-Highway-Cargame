// ------------------- DOM ELEMENTS -------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const restartBtn = document.getElementById('restartBtn');
const homeScreen = document.getElementById('homeScreen');
const startBtn = document.getElementById('startBtn');
const scoreDisplay = document.getElementById('score');
const gameOverBox = document.getElementById('gameOverBox');
const finalScoreText = document.getElementById('finalScore');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const homeBtn = document.getElementById('homeBtn');
const musicToggleBtn = document.getElementById('musicToggleBtn');
const musicToggleBtnGame = document.getElementById('musicToggleBtnGame');
const continueBtn = document.getElementById('continueBtn');
const homeSettingsMenu = document.getElementById('homeSettingsMenu');
const resetHighScoreBtn = document.getElementById('resetHighScoreBtn');
const closeHomeSettingsBtn = document.getElementById('closeHomeSettingsBtn');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const volumeBtn = document.getElementById('volumeBtn');
const volumeControl = document.getElementById('volumeControl');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');

// ------------------- VARIABLES -------------------
let frame = 0;
let laneOffsetY = 0;
let isPaused = false;
let highScore = parseInt(localStorage.getItem('retroHighScore')) || 0;
highScoreDisplay.textContent = 'High Score: ' + highScore;
let lastPatternName = null;
let lastPatternGaps = []; // Track gaps from the last pattern
let nextPatternDelay = 0; 
const forbidden = new Set(['WideningFunnel', 'PulseWave']);
// Road boundaries
const ROAD_LEFT = 30;
const ROAD_RIGHT = canvas.width - ROAD_LEFT;

// 8 lanes evenly across the road
const laneCount = 8;
const laneWidth = (ROAD_RIGHT - ROAD_LEFT) / laneCount;
const lanes = Array.from(
  { length: laneCount },
  (_, i) => ROAD_LEFT + laneWidth / 2 + i * laneWidth
);

let gameStarted = false;
let gameOver = false;
let loopStarted = false;
// ---------- smart-speed helpers ----------
const MIN_SPEED_FACTOR = 0.75;   // slowest car
const MAX_SPEED_FACTOR = 1.25;   // fastest car
const SAFE_GAP       = 80;       // px – keep this much vertical space

function chooseVehicleSpeed(base) {
    // ±25 % random, clamped
    const factor = MIN_SPEED_FACTOR + Math.random() * (MAX_SPEED_FACTOR - MIN_SPEED_FACTOR);
    return base * factor;
}

function adjustSpeedForCollision(vehiclesInLane, proposedY, proposedSpeed, baseSpeed) {
    for (const v of vehiclesInLane) {
        // only care about vehicles still above us
        if (v.y < proposedY) continue;

        const dist = v.y - (proposedY + 100); // 100 ≈ vehicle height
        if (dist < SAFE_GAP) {
            // slow down just enough not to touch
            return Math.min(proposedSpeed, v.speed * 0.95);
        }
    }
    return proposedSpeed;
}

const bgMusic = document.getElementById('bgMusic');
const tracks = [
    'audio/Audioinsmusic - Basscape.mp3',
    'audio/Audioinsmusic - Driftline.mp3',
    'audio/Audioinsmusic - Groovoid.mp3'
];

// ------------------- PLAYER BEHAVIOR TRACKING -------------------
let playerBehaviorData = {
    preferredLanes: Array(8).fill(0), // Track lane preference
    movementHistory: [], // Last 20 movements
    campingTendency: 0, // 0-1 scale of how much player camps
    reactionTime: [], // Track how quickly player reacts to patterns
    riskTaking: 0, // 0-1 scale of how risky player is
    lastPositions: [], // Track last 10 positions for camping detection
    adaptiveScore: 0 // Internal score for difficulty scaling
};

function updatePlayerBehavior() {
    const currentLane = Math.round((player.x + player.width/2 - ROAD_LEFT) / laneWidth);
    
    // Update preferred lanes
    if (currentLane >= 0 && currentLane < 8) {
        playerBehaviorData.preferredLanes[currentLane]++;
    }
    
    // Track movement history (last 20 frames)
    playerBehaviorData.movementHistory.push(currentLane);
    if (playerBehaviorData.movementHistory.length > 20) {
        playerBehaviorData.movementHistory.shift();
    }
    
    // Track positions for camping detection
    playerBehaviorData.lastPositions.push(currentLane);
    if (playerBehaviorData.lastPositions.length > 10) {
        playerBehaviorData.lastPositions.shift();
    }
    
    // Calculate camping tendency (variance in positions)
    if (playerBehaviorData.lastPositions.length >= 10) {
        const avg = playerBehaviorData.lastPositions.reduce((a, b) => a + b, 0) / 10;
        const variance = playerBehaviorData.lastPositions.reduce((sum, pos) => sum + Math.pow(pos - avg, 2), 0) / 10;
        playerBehaviorData.campingTendency = Math.max(0, 1 - variance / 4); // Normalize to 0-1
    }
    
    // Update adaptive score (increases faster after score 300)
    if (score > 300) {
        playerBehaviorData.adaptiveScore += 0.5;
    } else {
        playerBehaviorData.adaptiveScore += 0.1;
    }
}

function getPlayerPreferredSide() {
    const leftLanes = playerBehaviorData.preferredLanes.slice(0, 4).reduce((a, b) => a + b, 0);
    const rightLanes = playerBehaviorData.preferredLanes.slice(4, 8).reduce((a, b) => a + b, 0);
    
    if (leftLanes > rightLanes * 1.5) return 'left';
    if (rightLanes > leftLanes * 1.5) return 'right';
    return 'center';
}

function getMostAvoidedLanes() {
    const minUsage = Math.min(...playerBehaviorData.preferredLanes);
    return playerBehaviorData.preferredLanes
        .map((usage, index) => ({ lane: index, usage }))
        .filter(item => item.usage <= minUsage + 2)
        .map(item => item.lane);
}

// ------------------- ADAPTIVE PATTERN GENERATOR -------------------
function generateAdaptivePattern() {
    const currentLane = Math.round((player.x + player.width/2 - ROAD_LEFT) / laneWidth);
    const preferredSide = getPlayerPreferredSide();
    const avoidedLanes = getMostAvoidedLanes();
    const isEarlyGame = score < 300;
    const vehicleCount = 4 + Math.floor(Math.random() * 4); // 4-7 vehicles
    
    // Determine gap density and movement constraint
    const gapDensity = getGapDensity();
    const maxMovement = gapDensity === 'low' ? 3 : 2; // More gaps = more movement allowed
    
    // Create base pattern with calculated vehicles
    let pattern = Array(8).fill(0);
    let placedVehicles = 0;
    
    // Place vehicles strategically
    const vehiclePositions = generateVehiclePositions(vehicleCount, currentLane, isEarlyGame, preferredSide, avoidedLanes);
    
    vehiclePositions.forEach(pos => {
        if (pos >= 0 && pos < 8) {
            pattern[pos] = 1;
            placedVehicles++;
        }
    });
    
    // Ensure accessibility with movement constraints
    pattern = enforceMovementConstraints(pattern, currentLane, maxMovement);
    
    // Apply anti-camping measures if needed
    if (playerBehaviorData.campingTendency > 0.7 && !isEarlyGame) {
        pattern = applyAntiCampingMeasures(pattern, currentLane);
    }
    
    return pattern;
}

function getGapDensity() {
    // Analyze recent patterns to determine gap density
    let gapCount = 0;
    let totalSlots = 0;
    
    // Look at next few patterns in buffer
    for (let i = 0; i < Math.min(3, patternBuffer.length); i++) {
        const pat = patternBuffer[i];
        totalSlots += pat.length;
        gapCount += pat.filter(slot => slot === 0).length;
    }
    
    const gapRatio = totalSlots > 0 ? gapCount / totalSlots : 0.3;
    return gapRatio < 0.25 ? 'low' : 'high'; // low gaps = more movement allowed
}

function generateVehiclePositions(count, playerLane, isEarlyGame, preferredSide, avoidedLanes) {
    const positions = [];
    const usedPositions = new Set();
    
    // Macro randomness with constraints
    const constraints = {
        avoidPlayerLane: !isEarlyGame && Math.random() > 0.3,
        targetPreferredSide: !isEarlyGame && Math.random() > 0.4,
        blockAvoidedLanes: !isEarlyGame && Math.random() > 0.6,
        createClusters: Math.random() > 0.5,
        forceSparseAreas: Math.random() > 0.4
    };
    
    // Phase 1: Strategic placement
    if (constraints.targetPreferredSide && preferredSide !== 'center') {
        const targetLanes = preferredSide === 'left' ? [0, 1, 2, 3] : [4, 5, 6, 7];
        const blockedCount = Math.min(2 + Math.floor(Math.random() * 2), count);
        
        for (let i = 0; i < blockedCount && positions.length < count; i++) {
            const lane = targetLanes[Math.floor(Math.random() * targetLanes.length)];
            if (!usedPositions.has(lane)) {
                positions.push(lane);
                usedPositions.add(lane);
            }
        }
    }
    
    // Phase 2: Block avoided lanes (advanced difficulty)
    if (constraints.blockAvoidedLanes && avoidedLanes.length > 0) {
        const toBlock = Math.min(avoidedLanes.length - 1, count - positions.length); // Leave one escape
        for (let i = 0; i < toBlock; i++) {
            const lane = avoidedLanes[i];
            if (!usedPositions.has(lane)) {
                positions.push(lane);
                usedPositions.add(lane);
            }
        }
    }
    
    // Phase 3: Fill remaining positions with clustering/spacing logic
    const remainingCount = count - positions.length;
    const availableLanes = Array.from({length: 8}, (_, i) => i).filter(i => !usedPositions.has(i));
    
    if (constraints.createClusters && remainingCount > 1) {
        // Create vehicle clusters
        const clusterStart = availableLanes[Math.floor(Math.random() * (availableLanes.length - 1))];
        for (let i = 0; i < Math.min(remainingCount, 3); i++) {
            const lane = clusterStart + i;
            if (lane < 8 && availableLanes.includes(lane)) {
                positions.push(lane);
                usedPositions.add(lane);
            }
        }
    }
    
    // Phase 4: Fill any remaining slots randomly
    while (positions.length < count) {
        const remaining = availableLanes.filter(lane => !usedPositions.has(lane));
        if (remaining.length === 0) break;
        
        const lane = remaining[Math.floor(Math.random() * remaining.length)];
        positions.push(lane);
        usedPositions.add(lane);
    }
    
    return positions;
}

function enforceMovementConstraints(pattern, playerLane, maxMovement) {
    // Ensure at least one gap exists within movement range
    const minLane = Math.max(0, playerLane - maxMovement);
    const maxLane = Math.min(7, playerLane + maxMovement);
    
    // Check if any gaps exist in range
    let hasReachableGap = false;
    for (let i = minLane; i <= maxLane; i++) {
        if (pattern[i] === 0) {
            hasReachableGap = true;
            break;
        }
    }
    
    // Force create a gap if needed
    if (!hasReachableGap) {
        // Prefer gaps closer to player but not directly on player
        const gapCandidates = [];
        for (let i = minLane; i <= maxLane; i++) {
            if (i !== playerLane) {
                gapCandidates.push({ lane: i, distance: Math.abs(i - playerLane) });
            }
        }
        
        if (gapCandidates.length > 0) {
            gapCandidates.sort((a, b) => a.distance - b.distance);
            pattern[gapCandidates[0].lane] = 0;
        } else if (playerLane >= minLane && playerLane <= maxLane) {
            // Last resort: clear player's lane
            pattern[playerLane] = 0;
        }
    }
    
    return pattern;
}

function applyAntiCampingMeasures(pattern, playerLane) {
    // If player is camping, make their preferred area more challenging
    const preferredLanes = playerBehaviorData.preferredLanes
        .map((usage, index) => ({ lane: index, usage }))
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 3)
        .map(item => item.lane);
    
    // Add extra vehicles near preferred camping spots
    preferredLanes.forEach(lane => {
        if (Math.random() > 0.6 && pattern[lane] === 0) {
            // Don't completely block, but increase pressure
            const adjacent = [lane - 1, lane + 1].filter(l => l >= 0 && l < 8);
            adjacent.forEach(adjLane => {
                if (Math.random() > 0.7 && pattern[adjLane] === 0) {
                    pattern[adjLane] = 1;
                }
            });
        }
    });
    
    return pattern;
}

// ------------------- PATTERN DEFINITIONS -------------------
const patternDefs = [
  // Center Tunnel (8 rows)
  { name: 'CenterTunnel', weight: 18, baseLength: 8, variants: [
    [
      [0,0,0,0,0,0,0,0],
      [1,1,1,0,0,1,1,1],
      [1,1,0,0,1,0,1,1],
      [1,0,0,1,1,0,0,1],
      [0,0,1,1,1,1,0,0],
      [1,0,0,1,1,0,0,1],
      [1,1,0,0,1,0,1,1],
      [1,1,1,0,0,1,1,1],
      [1,1,0,0,1,0,1,1]
    ]
  ]},

  // Side Tunnels (6 rows) - FIXED SYNTAX ERROR
  { name: 'SideTunnels', weight: 12, baseLength: 6, variants: [
    [
      [0,0,0,0,0,0,0,0],
      [0,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1],
      [1,1,1,0,1,1,1,1],
      [0,0,0,0,0,0,0,0],
      [1,1,1,1,1,1,0,1],
      [1,1,1,1,1,1,1,0]
    ]
  ]},

  // Zig-Zag Sprint (10 rows)
  { name: 'ZigZagSprint', weight: 15, baseLength: 10, variants: [
    [
      [0,0,0,0,0,0,0,0],
      [0,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1],
      [1,1,0,1,1,1,1,1],
      [1,1,1,0,1,1,1,1],
      [1,1,1,1,0,1,1,1],
      [1,1,1,0,1,1,1,1],
      [1,1,0,1,1,1,1,1],
      [1,0,1,1,1,1,1,1],
      [0,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1]
    ]
  ]},

   { name: 'ZigZagcenter', weight: 15, baseLength: 10, variants: [
    [
      [0,0,0,0,0,0,0,0],
      [0,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1],
      [1,1,0,1,1,1,1,1],
      [1,1,1,0,1,1,1,1],
      [1,0,0,1,1,0,0,1],
      [1,1,0,0,1,0,1,1],
      [1,1,1,0,0,1,1,1],
      [1,1,0,0,1,0,1,1]
    ]
  ]},

  // Cluster-Break (5 rows)
  { name: 'ClusterBreak', weight: 15, baseLength: 5, variants: [
    [
      [0,0,0,0,0,0,0,0],
      [1,1,0,0,1,0,1,1],
      [0,1,0,1,0,1,1,0],
      [1,1,1,0,1,1,1,1],
      [0,0,1,1,0,1,0,0],
      [1,0,0,0,1,0,1,1]
    ]
  ]},

  // Wave Motion (7 rows)
  { name: 'WaveMotion', weight: 15, baseLength: 7, variants: [
    [
      [0,0,0,0,0,0,0,0],        
      [0,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1],
      [1,1,0,1,1,1,1,1],
      [1,1,1,0,1,1,1,1],
      [1,1,1,1,0,1,1,1],
      [1,1,1,1,1,0,1,1],
      [1,1,1,1,1,1,0,1]
    ]
  ]},

  // Widening Funnel (6 rows)
  { name: 'WideningFunnel', weight: 9, baseLength: 6, variants: [
    [
      [0,0,0,0,0,0,0,0],        
      [1,1,0,1,1,1,1,1],
      [1,1,0,0,0,1,1,1],
      [1,0,0,0,0,0,1,1],
      [1,1,0,0,0,1,1,1],
      [1,1,1,0,1,1,1,1],
      [1,1,1,1,0,1,1,1]
    ]
  ]},

  // Checkerboard (5 rows)
  { name: 'Checkerboard', weight: 13, baseLength: 5, variants: [
    [
      [0,0,0,0,0,0,0,0],        
      [0,1,0,1,0,1,0,1],
      [1,0,1,0,1,0,1,0],
      [0,1,0,1,0,1,0,1],
      [1,0,1,0,1,0,1,0],
      [0,1,0,1,0,1,0,1]
    ]
  ]},

  // Double-Center Tunnel (8 rows)
  { name: 'DoubleCenterTunnel', weight: 12, baseLength: 8, variants: [
    [
      [0,0,0,0,0,0,0,0],        
      [1,1,0,0,0,1,1,1],
      [1,0,0,1,0,0,1,1],
      [0,0,1,1,1,0,0,1],
      [0,1,1,1,1,1,0,0],
      [0,0,1,1,1,0,0,1],
      [1,0,0,1,0,0,1,1],
      [1,1,0,0,0,1,1,1],
      [1,0,0,1,0,0,1,1]
    ]
  ]},

  // Pulse Wave (9 rows)
  { name: 'PulseWave', weight: 9, baseLength: 9, variants: [
    [
      [0,0,0,0,0,0,0,0],        
      [1,1,1,1,1,0,1,1],
      [1,1,0,0,0,1,1,1],
      [1,0,0,0,0,0,1,1],
      [0,0,0,0,0,0,0,0],
      [1,0,0,0,0,0,0,1],
      [1,1,0,0,0,1,1,1],
      [1,1,0,1,1,1,1,1],
      [1,1,0,0,0,1,1,1],
      [1,0,0,0,0,0,1,1]
    ]
  ]},
  { name: 'EmptyBreak', weight: 8, baseLength: 3, variants: [
    [
      [0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0]
    ]
  ]},

  // NEW: Adaptive Random Path - Higher weight for more frequency
  { name: 'AdaptiveRandom', weight: 40, baseLength: 1, variants: [[]] } // Single row, generated dynamically
];

// ------------------- GAP CONTINUITY FUNCTION -------------------
function ensureGapContinuity(pattern, targetLength) {
  if (!lastPatternGaps.length || !pattern.length) {
    return pattern;
  }
  
  // Create a copy of the pattern to modify
  const processedPattern = pattern.map(row => [...row]);
  
  // Get current player lane for reference
  const playerLane = Math.round((player.x + player.width/2 - ROAD_LEFT) / laneWidth);
  
  // CRITICAL: Force modify the first row to guarantee accessibility
  const firstRow = processedPattern[0];
  
  // Find existing gaps in the first row
  const existingGaps = firstRow.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
  
  // Check if any existing gaps are within 3 lanes of player
  const reachableGaps = existingGaps.filter(gap => Math.abs(gap - playerLane) <= 3);
  
  // FORCE create a reachable gap if none exist
  if (reachableGaps.length === 0) {
    // Define strict reachable range (max 3 lanes)
    const minLane = Math.max(0, playerLane - 3);
    const maxLane = Math.min(firstRow.length - 1, playerLane + 3);
    
    // Try to preserve a previous gap if it's within range
    let targetGap = null;
    for (const prevGap of lastPatternGaps) {
      if (prevGap >= minLane && prevGap <= maxLane) {
        targetGap = prevGap;
        break;
      }
    }
    
    // If no previous gap is reachable, create one close to player
    if (targetGap === null) {
      // Prefer the player's current lane or adjacent lanes
      if (playerLane >= minLane && playerLane <= maxLane) {
        targetGap = playerLane;
      } else {
        // Choose the closest lane within range
        targetGap = playerLane < minLane ? minLane : maxLane;
      }
    }
    
    // FORCE create the gap
    firstRow[targetGap] = 0;
    
    console.log(`Forced gap creation at lane ${targetGap}, player at lane ${playerLane}`);
  }
  
  // Build the result pattern
  const result = [];
  for (let i = 0; i < targetLength; i++) {
    const rowIndex = i % processedPattern.length;
    result.push([...processedPattern[rowIndex]]);
  }
  
  return result;
}

function forcePatternAccessibility(pattern) {
    // Ensure pattern is an array
    if (!Array.isArray(pattern)) {
        console.warn('Pattern is not an array, converting:', pattern);
        return Array(8).fill(0); // Return safe empty pattern
    }
    
    // Get current player position
    const playerLane = Math.round((player.x + player.width/2 - ROAD_LEFT) / laneWidth);
    
    // Define maximum allowed movement (3 lanes)
    const minReachableLane = Math.max(0, playerLane - 3);
    const maxReachableLane = Math.min(pattern.length - 1, playerLane + 3);
    
    // Find existing gaps
    const gaps = pattern.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
    const reachableGaps = gaps.filter(gap => gap >= minReachableLane && gap <= maxReachableLane);
    
    // If no reachable gaps exist, FORCE create one
    if (reachableGaps.length === 0) {
        // Clear the player's current lane first (highest priority)
        if (playerLane >= 0 && playerLane < pattern.length) {
            pattern[playerLane] = 0;
            console.log(`EMERGENCY: Cleared player's current lane ${playerLane}`);
        } else {
            // Player lane is out of bounds, clear the closest reachable lane
            const fallbackLane = playerLane < minReachableLane ? minReachableLane : maxReachableLane;
            pattern[fallbackLane] = 0;
            console.log(`EMERGENCY: Cleared fallback lane ${fallbackLane}`);
        }
    }
    
    return pattern;
}

// Utility: pick a weighted random patternDef
function pickPatternDef() {
  // compute total weight once
  const totalW = patternDefs.reduce((sum, p) => sum + p.weight, 0);

  let p;
  do {
    // weighted random selection
    let r = Math.random() * totalW;
    for (const cand of patternDefs) {
      if (r < cand.weight) {
        p = cand;
        break;
      }
      r -= cand.weight;
    }
    // if somehow nothing was picked, fallback
    if (!p) p = patternDefs[0];

    // repeat if both last and current are in the forbidden set
  } while (
    lastPatternName &&
    forbidden.has(lastPatternName) &&
    forbidden.has(p.name)
  );

  // remember for next time
  lastPatternName = p.name;
  return p;
}

// Holds the next ~20 rows of patterns to spawn
let patternBuffer = [];
let currentBlockSpeedFactor = 1.0;
const GAP_SPEED_MULT = 1.10;

// ------------------- MUSIC CONTROL -------------------
function initializeMusicState() {
    const savedVolume = parseFloat(localStorage.getItem('retroMusicVolume')) || 0.5;
    bgMusic.volume = savedVolume;
    volumeSlider.value = savedVolume * 100;
    volumeValue.textContent = `${Math.round(savedVolume * 100)}%`;

    let trackIndex = parseInt(localStorage.getItem('retroMusicTrackIndex')) || Math.floor(Math.random() * tracks.length);
    if (trackIndex < 0 || trackIndex >= tracks.length) {
        trackIndex = Math.floor(Math.random() * tracks.length);
    }
    bgMusic.src = tracks[trackIndex];
    localStorage.setItem('retroMusicTrackIndex', trackIndex);

    const savedTime = parseFloat(localStorage.getItem('retroMusicTime')) || 0;
    bgMusic.currentTime = savedTime;

    if (!localStorage.getItem('retroMusicPaused')) {
        localStorage.setItem('retroMusicPaused', 'false');
    }

    const isPaused = localStorage.getItem('retroMusicPaused') === 'true';
    if (isPaused) {
        bgMusic.pause();
    } else {
        bgMusic.play().catch(e => {
            console.log('Autoplay prevented, waiting for user interaction');
            localStorage.setItem('retroMusicPaused', 'true');
        });
    }
    updateMusicButtons();
}

bgMusic.addEventListener('timeupdate', () => {
    localStorage.setItem('retroMusicTime', bgMusic.currentTime);
});

function toggleMusic() {
    if (bgMusic.paused) {
        bgMusic.play().catch(e => console.log('Music play failed:', e));
        localStorage.setItem('retroMusicPaused', 'false');
    } else {
        bgMusic.pause();
        localStorage.setItem('retroMusicPaused', 'true');
        localStorage.setItem('retroMusicTime', bgMusic.currentTime);
    }
    updateMusicButtons();
}

function updateMusicButtons() {
    const label = bgMusic.paused ? 'Play Music' : 'Pause Music';
    musicToggleBtn.textContent = label;
    musicToggleBtnGame.textContent = label;
}

function toggleVolumeControl() {
    volumeControl.style.display = volumeControl.style.display === 'block' ? 'none' : 'block';
}

volumeBtn.addEventListener('click', toggleVolumeControl);

volumeSlider.addEventListener('input', () => {
    const volume = volumeSlider.value / 100;
    bgMusic.volume = volume;
    localStorage.setItem('retroMusicVolume', volume);
    volumeValue.textContent = `${volumeSlider.value}%`;
});

bgMusic.addEventListener('ended', () => {
    if (localStorage.getItem('retroMusicPaused') !== 'true') {
        const newTrackIndex = Math.floor(Math.random() * tracks.length);
        bgMusic.src = tracks[newTrackIndex];
        localStorage.setItem('retroMusicTrackIndex', newTrackIndex);
        localStorage.setItem('retroMusicTime', 0);
        bgMusic.play().catch(e => console.log('Music play failed:', e));
    }
}); 

[musicToggleBtn, musicToggleBtnGame].forEach(btn => {
    btn.addEventListener('click', toggleMusic);
});

initializeMusicState();

// ------------------- GAME START / RESET -------------------
startBtn.addEventListener('click', () => {
    homeScreen.style.display = 'none';
    canvas.style.display = 'block';
    scoreDisplay.style.display = 'block';
    settingsBtn.style.display = 'block';
    volumeBtn.style.display = 'block';
    gameStarted = true;
    isPaused = false;

    if (!loopStarted) {
        loopStarted = true;
        loop();
    }

    if (localStorage.getItem('retroMusicPaused') !== 'true') {
        bgMusic.play().catch(e => console.log('Music play failed:', e));
    }
    updateMusicButtons();
    volumeControl.style.display = 'none';
});

function resetGame() {
    frame = 0;
    laneOffsetY = 0;
    enemies.length = 0;
    sideObjects.length = 0;
    score = 0;
    scoreDisplay.textContent = 'Score: 0';
    gameOver = false;
    player.x = lanes[2] - player.width / 2;
    playerTargetX = player.x;
    gameOverBox.style.display = 'none';
    gameStarted = true;
    isPaused = false;
    trafficFlow = [];
    nextTrafficRow = -150;
    patternBuffer = [];
    currentBlockSpeedFactor = 1.0;
    
    // Reset new variables
    lastPatternGaps = [];
    nextPatternDelay = 0;
    
    // Reset player behavior tracking
    playerBehaviorData = {
        preferredLanes: Array(8).fill(0),
        movementHistory: [],
        campingTendency: 0,
        reactionTime: [],
        riskTaking: 0,
        lastPositions: [],
        adaptiveScore: 0
    };

    if (localStorage.getItem('retroMusicPaused') !== 'true') {
        bgMusic.play().catch(e => console.log('Music play failed:', e));
    }
    updateMusicButtons();
    volumeControl.style.display = 'none';
}

restartBtn.addEventListener('click', resetGame);

// ------------------- GAME OVER -------------------
function triggerGameOver() {
    if (gameOver) return;
    gameOver = true;
    updateMusicButtons();
    volumeControl.style.display = 'none';

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('retroHighScore', highScore);
        highScoreDisplay.textContent = 'High Score: ' + highScore;
    }
    finalScoreText.textContent = 'Your Score: ' + score;
    gameOverBox.style.display = 'block';
}

// ------------------- SETTINGS / HOME -------------------
settingsBtn.addEventListener('click', () => {
    if (!gameStarted) {
        homeSettingsMenu.style.display = homeSettingsMenu.style.display === 'block' ? 'none' : 'block';
    } else if (gameOver) {
        gameOverBox.style.display = 'none';
        settingsMenu.style.display = 'block';
    } else {
        isPaused = true;
        settingsMenu.style.display = 'block';
    }
    volumeControl.style.display = 'none';
});

continueBtn.addEventListener('click', () => {
    settingsMenu.style.display = 'none';
    if (gameOver) {
        gameOverBox.style.display = 'block';
    } else {
        isPaused = false;
        if (localStorage.getItem('retroMusicPaused') === 'false') {
            bgMusic.play().catch(e => console.log('Music play failed:', e));
        }
    }
    volumeControl.style.display = 'none';
});

homeBtn.addEventListener('click', () => {
    isPaused = false;
    settingsMenu.style.display = 'none';
    homeSettingsMenu.style.display = 'none';
    gameOverBox.style.display = 'none';
    gameStarted = false;
    canvas.style.display = 'none';
    scoreDisplay.style.display = 'none';
    volumeBtn.style.display = 'none';
    homeScreen.style.display = 'block';
    settingsBtn.style.display = 'block';

    if (localStorage.getItem('retroMusicPaused') !== 'true') {
        bgMusic.play().catch(e => console.log('Music play failed:', e));
    }
    updateMusicButtons();
    volumeControl.style.display = 'none';
});

closeHomeSettingsBtn.addEventListener('click', () => {
    homeSettingsMenu.style.display = 'none';
    volumeControl.style.display = 'none';
});

resetHighScoreBtn.addEventListener('click', () => {
    localStorage.removeItem('retroHighScore');
    highScore = 0;
    highScoreDisplay.textContent = 'High Score: 0';
    homeSettingsMenu.style.display = 'none';
    volumeControl.style.display = 'none';
});

// ------------------- GAME LOGIC -------------------
const trafficCars = ['barrier.png', 'box.png', 'cone.png', 'car.png', 'car2.png', 'car3.png', 'truck2.png', 'truck3.png', 'truck4.png', 'truck5.png'];

const scaleMap = {
    'player': { width: 28, height: 25 },
    'car.png': { width: 28, height: 35 },
    'car2.png': { width: 28, height: 35 },
    'car3.png': { width: 28, height: 35 },
    'barrier.png': { width: 28, height: 16 },
    'box.png': { width: 14, height: 16 },
    'cone.png': { width: 14, height: 18 },
    'truck2.png': { width: 28, height: 50 },
    'truck3.png': { width: 28, height: 50 },
    'truck4.png': { width: 28, height: 50 },
    'truck5.png': { width: 28, height: 70 }
};

const trafficImages = {};
trafficCars.forEach(name => {
    const img = new Image();
    img.src = `images/traffic_images/${name}`;
    trafficImages[name] = img;
});

const playerImg = new Image();
playerImg.src = 'images/player_images/player.png';
const player = {
  lane: Math.floor(laneCount/2),
  x: 0,
  y: canvas.height - scaleMap['player'].height - 57,
  width: scaleMap['player'].width,
  height: scaleMap['player'].height,
  speed: 5
};
player.x = lanes[player.lane] - player.width / 2;
let playerTargetX = player.x;

const enemies = [];
const sideObjects = [];
let score = 0;
let trafficFlow = [];
let nextTrafficRow = -150;

// ------------------- TRAFFIC SYSTEM -------------------
function getTrafficDensity() {
    if (score < 100) return 'light';
    if (score < 300) return 'medium';
    if (score < 600) return 'heavy';
    return 'jam';
}

function refillPatternBuffer() {
    while (patternBuffer.length < 20) {
        // Nudge speed by ±5%
        const delta = (Math.random() * 0.10) - 0.05;
        currentBlockSpeedFactor = Math.max(0.5, Math.min(2.0,
            currentBlockSpeedFactor * (1 + delta)
        ));
        
        // Get next block
        const def = pickPatternDef();
        let processedPattern;
        
        // Handle adaptive random pattern specially
        if (def.name === 'AdaptiveRandom') {
            // Generate single adaptive row
            const adaptiveRow = generateAdaptivePattern();
            processedPattern = [adaptiveRow];
        } else {
            // Use existing pattern logic
            const length = def.baseLength + (Math.floor(Math.random() * 3) - 1);
            const selectedVariant = def.variants[Math.floor(Math.random() * def.variants.length)];
            processedPattern = ensureGapContinuity(selectedVariant, length);
        }
        
        // Process each row with aggressive accessibility checking
        for (let i = 0; i < processedPattern.length; i++) {
            let row = processedPattern[i];
            
            // Ensure row is an array before processing
            if (!Array.isArray(row)) {
                console.warn('Row is not array, creating safe fallback:', row);
                row = Array(8).fill(0); // Safe fallback
            } else {
                row = [...row]; // Create copy to avoid mutation
            }
            
            // CRITICAL: Force accessibility on every single row
            row = forcePatternAccessibility(row);
            
            patternBuffer.push(row);
        }
        
        // Store the gaps from the last row of this pattern for next pattern
        const lastRow = processedPattern[processedPattern.length - 1];
        if (Array.isArray(lastRow)) {
            lastPatternGaps = lastRow.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
        } else {
            lastPatternGaps = []; // Reset if last row is invalid
        }
    }
}

function manageTrafficFlow() {
    if (nextTrafficRow > -100) {
        if (!patternBuffer.length) refillPatternBuffer();
        const pattern = patternBuffer.shift();
        spawnTrafficRow(pattern, nextTrafficRow);

        const d = getTrafficDensity();
        // More consistent spacing - removed random variation that causes stuttering
        let spacing = 160; // Default distance

        if (Math.random() < 0.25) {
            spacing = 200;
        }
        
        nextTrafficRow -= spacing;
    }
    // Smooth, consistent movement
    nextTrafficRow += 2.5 * getSpeedMultiplier();
    if (nextTrafficRow > canvas.height + 200) nextTrafficRow = -150;
}

// ---------- IDM constants ----------
const IDM_T   = 0.8;      // desired time headway (s)
const IDM_s0  = 20;       // minimum gap (px)
const IDM_b   = 1.8;      // comfortable braking (px/frame²)
const IDM_delta = 4;
const IDM_aMax = 2.0; 

function spawnTrafficRow(pattern, yPos) {
    /* === 0. safety + accessibility === */
    if (!Array.isArray(pattern)) pattern = Array(8).fill(0);
    pattern = forcePatternAccessibility([...pattern]);
    const playerLane = Math.round((player.x + player.width / 2 - ROAD_LEFT) / laneWidth);
    const reachable = pattern
        .map((v, i) => (v === 0 ? i : -1))
        .filter(i => i >= 0 && Math.abs(i - playerLane) <= 3);

    if (reachable.length === 0) {
        const minL = Math.max(0, playerLane - 3);
        const maxL = Math.min(7, playerLane + 3);
        pattern[minL + Math.floor(Math.random() * (maxL - minL + 1))] = 0;
    }

    /* === 1. build per-lane lookup for gaps === */
    const laneFrontCar = Array.from({ length: 8 }, () => null);
    enemies.forEach(e => {
        const lane = Math.round((e.x + e.width / 2 - ROAD_LEFT) / laneWidth);
        if (lane >= 0 && lane < 8 && e.y > yPos - 200) {
            if (!laneFrontCar[lane] || e.y < laneFrontCar[lane].y)
                laneFrontCar[lane] = e;
        }
    });

    /* === 2. spawning === */
    const baseSpeed = 2.5 * getSpeedMultiplier();
    pattern.forEach((hasV, i) => {
        if (!hasV) return;

        /* pick sprite */
        const d = getTrafficDensity();
        let types =
            d === 'light'  ? ['car.png', 'car2.png', 'car3.png']
          : d === 'medium' ? ['car.png', 'car2.png', 'car3.png', 'truck2.png']
                           : ['car.png', 'car2.png', 'car3.png', 'truck2.png', 'truck3.png'];
        if ((d === 'light' && Math.random() < 0.005) ||
            (d === 'medium' && Math.random() < 0.002))
            types.push('barrier.png', 'cone.png', 'box.png');
        const name   = types[Math.floor(Math.random() * types.length)];
        const { width, height } = scaleMap[name];

        /* small vertical jitter already in place */
        const verticalOffset = (Math.random() - 0.5) * 15;

        /* === 3. IDM initial speed === */
        const v0 = baseSpeed * (0.8 + Math.random() * 0.4);
        const v  = v0;

        /* ◄◄◄  Extra stagger so cars start further apart  ◄◄◄ */
        const startStagger = (Math.random() - 0.5) * 120; // ±60 px

        enemies.push({
            name,
            x: lanes[i] - width / 2,
            y: yPos + verticalOffset + startStagger, // stagger applied here
            width,
            height,
            speed: v,
            v0,
            a: 0
        });
    });
}
/* ---------- IDM acceleration update ---------- */

function updateIDM(car) {
    const v  = car.speed;
    const v0 = car.v0;

    /* find leader */
    const lane = Math.round((car.x + car.width / 2 - ROAD_LEFT) / laneWidth);
    let leader = null;
    for (const e of enemies) {
        if (e === car) continue;
        const eLane = Math.round((e.x + e.width / 2 - ROAD_LEFT) / laneWidth);
        if (eLane === lane && e.y > car.y + car.height && e.y < canvas.height) {
            if (!leader || e.y < leader.y) leader = e;
        }
    }

    /* IDM formula */
    const gap = leader ? leader.y - (car.y + car.height) : 9999;
    const deltaV = leader ? v - leader.speed : 0;
    const s_star = IDM_s0 + v * IDM_T + (v * deltaV) / (2 * Math.sqrt(IDM_aMax * IDM_b));

    let acc = IDM_aMax * (1 - Math.pow(v / v0, IDM_delta) - Math.pow(s_star / Math.max(gap, 0.1), 2));
    acc = Math.max(acc, -IDM_b);          // clamp braking
    acc = Math.min(acc, IDM_aMax);        // clamp acceleration

    return acc;
}

function validatePatternAccessibility(pattern) {
    // Double-check that the pattern has at least one gap within 3 lanes of player
    const playerLane = Math.round((player.x + player.width/2 - ROAD_LEFT) / laneWidth);
    const gaps = pattern.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
    const reachableGaps = gaps.filter(gap => Math.abs(gap - playerLane) <= 3);
    
    if (reachableGaps.length === 0) {
        console.warn('Pattern validation failed - forcing gap creation');
        // Force create a gap within range
        const minLane = Math.max(0, playerLane - 3);
        const maxLane = Math.min(pattern.length - 1, playerLane + 3);
        const forcedGap = minLane + Math.floor(Math.random() * (maxLane - minLane + 1));
        pattern[forcedGap] = 0;
    }
    
    return pattern;
}

function checkCollision() {
    if (gameOver) return;
    for (const enemy of enemies) {
        if (player.x < enemy.x + enemy.width && 
            player.x + player.width > enemy.x && 
            player.y < enemy.y + enemy.height && 
            player.y + player.height > enemy.y) {
            triggerGameOver();
            return;
        }
    }
}

function drawSidewalk() {
    ctx.fillStyle = '#d2b48c';
    ctx.fillRect(0, 0, 30, canvas.height);
    ctx.fillRect(canvas.width - 30, 0, 30, canvas.height);
}

function drawRoad() {
    // Draw asphalt
    ctx.fillStyle = '#333';
    ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, canvas.height);

    // Draw lane dividers
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 20]);
    ctx.lineDashOffset = -laneOffsetY;

    // Draw one line per lane boundary
    for (let i = 1; i < laneCount; i++) {
        const x = ROAD_LEFT + i * laneWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Reset dash
    ctx.setLineDash([]);
}

function spawnSideObject() {
    const leftItems = ['tree.png', 'light_l.png'];
    const rightItems = ['tree-pine.png', 'light_r.png'];
    const useLeft = Math.random() > 0.5;
    const selected = (useLeft ? leftItems : rightItems)[Math.floor(Math.random() * 2)];
    sideObjects.push({
        x: selected.includes('light_r') || selected.includes('pine') ? canvas.width - 30 : 0,
        y: -100,
        img: `images/sidewalk_images/${selected}`,
        width: 30,
        height: 50
    });
}

function drawSideObjects() {
    if (frame % 150 === 0) spawnSideObject();
    const speedMultiplier = getSpeedMultiplier();
    sideObjects.forEach(obj => {
        obj.y += 1.5 * speedMultiplier; 
        const img = new Image();
        img.src = obj.img;
        ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
    });
    for (let i = sideObjects.length - 1; i >= 0; i--) {
        if (sideObjects[i].y > canvas.height + 50) sideObjects.splice(i, 1);
    }
}

function drawPlayer() {
    ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
}

function drawEnemies() {
    enemies.forEach(enemy => {
        const img = trafficImages[enemy.name];
        ctx.drawImage(img, enemy.x, enemy.y, enemy.width, enemy.height);
    });
}

function getSpeedMultiplier() {
  const minScore = 0;
  const maxScore = 1200;
  const minSpeed = 0.65;
  const maxSpeed = 1.35;

  const clampedScore = Math.min(Math.max(score, minScore), maxScore);
  const progress = (clampedScore - minScore) / (maxScore - minScore);
  return minSpeed + progress * (maxSpeed - minSpeed);
}

function updateEnemies() {
    enemies.forEach(enemy => {
        // compute new acceleration with IDM
        const acc = updateIDM(enemy);
        enemy.speed = Math.max(0.1, enemy.speed + acc); // never reverse
        enemy.y += enemy.speed;
    });

    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].y > canvas.height) {
            const isNonScoring = ['barrier.png', 'box.png', 'cone.png'].includes(enemies[i].name);
            enemies.splice(i, 1);
            if (!isNonScoring) {
                score++;
                scoreDisplay.textContent = 'Score: ' + score;
            }
        }
    }
}

function updatePlayer() {
    const dx = playerTargetX - player.x;
    const distance = Math.abs(dx);
    
    // Faster, more responsive movement
    if (distance > 1) {
        // Use a higher interpolation factor for snappier movement
        const moveSpeed = Math.max(distance * 0.25, 8); // Minimum speed of 8px per frame
        player.x += Math.sign(dx) * Math.min(moveSpeed, distance);
    } else {
        // Snap to target when very close
        player.x = playerTargetX;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSidewalk();
    drawRoad();
    drawSideObjects();
    drawEnemies();
    drawPlayer();
}

function update() {
    if (gameOver) return;
    frame++;
    const speedMultiplier = getSpeedMultiplier();
    laneOffsetY += 1.5 * speedMultiplier;
    if (laneOffsetY > 40) laneOffsetY = 0;
    
    // Update player behavior tracking every frame
    if (frame % 5 === 0) { // Track every 5 frames to avoid performance issues
        updatePlayerBehavior();
    }
    
    // Manage continuous traffic flow
    manageTrafficFlow();
    
    updateEnemies();
    updatePlayer();
    checkCollision();
}

document.addEventListener('keydown', e => {
    if (!gameStarted || gameOver || isPaused) return;
    
    if (e.key === 'ArrowLeft' && playerTargetX - laneWidth >= ROAD_LEFT) {
        playerTargetX -= laneWidth;
    }
    if (e.key === 'ArrowRight' && playerTargetX + laneWidth + player.width <= ROAD_RIGHT) {
        playerTargetX += laneWidth;
    }
});

// ------------------- GAME LOOP -------------------
function loop() {
    if (gameStarted && !isPaused) {
        update();
        draw();
    }
    requestAnimationFrame(loop);
}