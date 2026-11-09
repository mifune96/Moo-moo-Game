// ============================================
// MOO MOO - Endless Runner Game
// Based on Game Design Document by MOO&co
// Informatics Grade 11 - Muhammad Rayhan, S.Kom
// ============================================

(function() {
'use strict';

// ---- Canvas Setup ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const W = () => window.innerWidth;
const H = () => window.innerHeight;

// ---- Constants from GDD ----
const LANE_COUNT = 3;
const BASE_SPEED = 6;
const MAX_SPEED = 20;

// Biome distance thresholds (meters)
const BIOME_BARNYARD = 0;       // Level 1: Barnyard Escape (0 - 500m)
const BIOME_HARVEST = 500;      // Level 2: Harvest Fields (500 - 1500m)
const BIOME_HIGHWAY = 1500;     // Level 3: Country Highway (1500m+)

// Power-up durations (seconds)
const TURBO_DURATION = 5;
const MAGNET_DURATION = 8;

// Colors from GDD
const COLORS = {
    grassGreen: '#7CBC37',
    barnRed: '#D9383A',
    strawYellow: '#F9C846',
    skyBlue: '#4EC0E9',
    cowbellGold: '#E8A923',
    road: '#A0875A',
    roadLine: '#F9C846',
    mud: '#6B4226',
    asphalt: '#444444',
};

// ---- Perspective Geometry ----
const VANISH_Y_RATIO = 0.36;    // horizon line
const PLAYER_Y_RATIO = 0.74;    // cow's running baseline
const ROAD_BOTTOM_WIDTH = 0.78; // road covers 78% of screen at bottom
const ROAD_TOP_WIDTH = 0.08;    // road width at horizon

function getPerspectiveT(screenY) {
    const vanishY = H() * VANISH_Y_RATIO;
    return Math.max(0, Math.min(1, (screenY - vanishY) / (H() - vanishY)));
}

function getScaleAtY(screenY) {
    return Math.max(0.18, getPerspectiveT(screenY));
}

function drawBubbleRect(x, y, w, h, r = 8) {
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
    }
}

function getRoadCenterX() {
    return W() / 2;
}

function getRoadHalfWidth(screenY) {
    const t = getPerspectiveT(screenY);
    const bottomHalf = W() * ROAD_BOTTOM_WIDTH / 2;
    const topHalf = W() * ROAD_TOP_WIDTH / 2;
    return topHalf + (bottomHalf - topHalf) * t;
}

function getLaneWidthAtY(screenY) {
    return (getRoadHalfWidth(screenY) * 2) / LANE_COUNT;
}

function getLaneXAtY(lane, screenY) {
    const cx = getRoadCenterX();
    const halfW = getRoadHalfWidth(screenY);
    const laneW = (halfW * 2) / LANE_COUNT;
    return cx - halfW + laneW * lane + laneW / 2;
}

function getLaneX(lane) {
    return getLaneXAtY(lane, H() * PLAYER_Y_RATIO);
}

// ---- Audio Synthesizer (Zero Dependencies) ----
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let soundEnabled = true;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, duration, type = 'square', vol = 0.15) {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

function sfxCoin() {
    playTone(987, 0.08, 'sine', 0.14);
    setTimeout(() => playTone(1318, 0.12, 'sine', 0.12), 40);
}
function sfxJump() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(650, audioCtx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.18);
    } catch(e) {}
}
function sfxSlide() {
    playTone(180, 0.15, 'sawtooth', 0.08);
}
function sfxCrash() {
    playTone(85, 0.4, 'sawtooth', 0.25);
    setTimeout(() => playTone(55, 0.35, 'square', 0.2), 50);
}
function sfxPowerup() {
    [440, 554, 659, 880].forEach((f, idx) => {
        setTimeout(() => playTone(f, 0.12, 'sine', 0.15), idx * 60);
    });
}
function sfxMoo() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(165, audioCtx.currentTime + 0.25);
        osc.frequency.linearRampToValueAtTime(95, audioCtx.currentTime + 0.7);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.7);
    } catch(e) {}
}
function sfxBark() {
    playTone(420, 0.09, 'sawtooth', 0.12);
    setTimeout(() => playTone(500, 0.08, 'sawtooth', 0.1), 100);
}
function sfxClick() {
    playTone(700, 0.04, 'sine', 0.08);
}

// Country Banjo BGM
let bgmInterval = null;
function startBGM() {
    if (!soundEnabled || !audioCtx) return;
    stopBGM();
    const melody = [262, 330, 392, 523, 392, 330, 294, 349, 440, 349, 262, 330];
    let step = 0;
    bgmInterval = setInterval(() => {
        if (state === 'playing') {
            const freq = melody[step % melody.length];
            playTone(freq, 0.18, 'triangle', 0.035);
            if (step % 2 === 0) playTone(130, 0.12, 'sine', 0.03); // bass thump
            step++;
        }
    }, 220);
}
function stopBGM() {
    if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

// ---- Persistent State ----
let totalCoins = parseInt(localStorage.getItem('moomoo_coins') || '0');
let highScore = parseInt(localStorage.getItem('moomoo_highscore') || '0');
let ownedSkins = JSON.parse(localStorage.getItem('moomoo_skins') || '["default"]');
let activeSkin = localStorage.getItem('moomoo_active_skin') || 'default';
let scoreMultiplier = parseFloat(localStorage.getItem('moomoo_multiplier') || '1');

function saveData() {
    localStorage.setItem('moomoo_coins', totalCoins);
    localStorage.setItem('moomoo_highscore', highScore);
    localStorage.setItem('moomoo_skins', JSON.stringify(ownedSkins));
    localStorage.setItem('moomoo_active_skin', activeSkin);
    localStorage.setItem('moomoo_multiplier', scoreMultiplier);
}

// ---- Game State ----
let state = 'menu'; // menu, playing, paused, gameover
let distance = 0;
let score = 0;
let coinsCollected = 0;
let gameSpeed = BASE_SPEED;
let frameCount = 0;
let lastTime = 0;

// ---- Characters & Entities ----

// 1. Moo Moo the Cow (Player)
const player = {
    lane: 1,
    targetLane: 1,
    x: 0,
    y: 0,
    jumping: false,
    jumpY: 0,
    jumpVel: 0,
    sliding: false,
    slideTimer: 0,
    hasShield: false,
    turboActive: false,
    turboTimer: 0,
    magnetActive: false,
    magnetTimer: 0,
    animFrame: 0,
    animTimer: 0,
    stumbleTimer: 0,
    mooTimer: 0,
    mooCooldown: 0,
};

// 2. Farmer Joe (The Pursuer - GDD 2.4)
const farmerJoe = {
    active: true,
    lane: 1,
    x: 0,
    y: 0,
    closeness: 15,          // 0 (far) to 100 (catches player)
    throwTimer: 0,
    throwing: false,
    throwAnim: 0,
    shoutText: '',
    shoutTimer: 0,
    stunnedTimer: 0,        // caused by Moo Moo's MOO
};

// 3. Rover the Dog (Elite Enemy - GDD 2.4)
const rover = {
    active: false,
    lane: 1,
    targetLane: 1,
    x: 0,
    y: 0,
    progressY: 0,
    warning: false,
    warningTimer: 0,
    leaping: false,
    barkText: '',
    barkTimer: 0,
    stunnedTimer: 0,
};

// 4. Kiki the Pigeon (Supporting NPC Guide - GDD 2.5)
const kiki = {
    x: 0,
    y: 0,
    wingAngle: 0,
    tipText: '',
    tipTimer: 0,
};

// 5. Farm Helicopter (Boss Enemy - GDD 2.4)
const helicopter = {
    active: false,
    x: 0,
    y: 0,
    targetX: 0,
    dropTimer: 0,
    spotlightAngle: 0,
    drops: [],              // falling net barricades
};

// ---- Wave / Object System ----
let obstacles = [];
let coins = [];
let powerups = [];
let particles = [];
let flyingTexts = [];
let nextSpawnDistance = 20;

// ---- Biome Logic (GDD 4.2) ----
function getCurrentBiome() {
    if (distance >= BIOME_HIGHWAY) return 'highway';
    if (distance >= BIOME_HARVEST) return 'harvest';
    return 'barnyard';
}

function getBiomeColors() {
    const biome = getCurrentBiome();
    switch(biome) {
        case 'barnyard':
            return {
                name: 'Level 1: Barnyard Escape',
                sky: ['#4EC0E9', '#A6E3F9'],
                ground: '#7CBC37',
                road: '#A0875A',
                roadLine: '#F9C846',
                ambient: 'rgba(255, 255, 230, 0.04)',
            };
        case 'harvest':
            return {
                name: 'Level 2: Harvest Fields',
                sky: ['#F59E0B', '#FCD34D'],
                ground: '#C59A26',
                road: '#8B6914',
                roadLine: '#FDE047',
                ambient: 'rgba(255, 180, 50, 0.08)',
            };
        case 'highway':
            return {
                name: 'Level 3: Country Highway',
                sky: ['#38BDF8', '#93C5FD'],
                ground: '#4B5563',
                road: '#374151',
                roadLine: '#F8FAFC',
                ambient: 'rgba(200, 220, 255, 0.05)',
            };
    }
}

// ---- Initialize Game ----
function initGame() {
    distance = 0;
    score = 0;
    coinsCollected = 0;
    gameSpeed = BASE_SPEED;
    frameCount = 0;

    player.lane = 1;
    player.targetLane = 1;
    player.y = H() * PLAYER_Y_RATIO;
    player.x = getLaneX(1);
    player.jumping = false;
    player.jumpY = 0;
    player.jumpVel = 0;
    player.sliding = false;
    player.slideTimer = 0;
    player.hasShield = false;
    player.turboActive = false;
    player.turboTimer = 0;
    player.magnetActive = false;
    player.magnetTimer = 0;
    player.stumbleTimer = 0;
    player.mooTimer = 0;
    player.mooCooldown = 0;

    farmerJoe.active = true;
    farmerJoe.lane = 1;
    farmerJoe.closeness = 15;
    farmerJoe.throwTimer = 0;
    farmerJoe.throwing = false;
    farmerJoe.shoutText = "Stop that cow! 👨‍🌾";
    farmerJoe.shoutTimer = 180;
    farmerJoe.stunnedTimer = 0;

    rover.active = false;
    rover.warning = false;
    rover.leaping = false;

    helicopter.active = false;
    helicopter.drops = [];

    kiki.x = player.x + 35;
    kiki.y = player.y - 85;
    kiki.tipText = "Run Moo Moo! Swipe or WASD to dodge! 🐦";
    kiki.tipTimer = 240;

    obstacles = [];
    coins = [];
    powerups = [];
    particles = [];
    flyingTexts = [];
    nextSpawnDistance = 25;
}

// ---- Pattern-Based Level Spawning (Never overlaps coins & deadly obstacles!) ----
function generateWave() {
    const biome = getCurrentBiome();
    const vanishY = H() * VANISH_Y_RATIO;

    // Pick a wave pattern
    const patterns = ['jump_fence', 'hay_dodge', 'barrier_slide', 'tractor_warning', 'coin_spread', 'mud_risk'];
    if (biome === 'harvest') patterns.push('tractor_warning', 'mud_risk');
    if (biome === 'highway') patterns.push('truck_dodge', 'fast_fences');

    const choice = patterns[Math.floor(Math.random() * patterns.length)];
    const primaryLane = Math.floor(Math.random() * 3);
    const otherLanes = [0, 1, 2].filter(l => l !== primaryLane);

    switch(choice) {
        case 'jump_fence': {
            // Fence in primaryLane, coins arc in air above it (jump reward)
            obstacles.push({
                type: 'fence',
                lane: primaryLane,
                y: vanishY - 15,
                jumpable: true,
                slideable: false,
                hit: false,
            });
            // Arced coins above the fence!
            for (let i = -1; i <= 1; i++) {
                coins.push({
                    lane: primaryLane,
                    y: vanishY - 15 + i * 25,
                    airborne: true, // collected when jumping!
                    arcHeight: i === 0 ? 45 : 22, // rainbow jump curve!
                    collected: false,
                    sparkle: Math.random() * 6,
                });
            }
            // Ground coins on safe lane
            const safeLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
            for (let i = 0; i < 3; i++) {
                coins.push({
                    lane: safeLane,
                    y: vanishY - 30 - i * 35,
                    airborne: false,
                    collected: false,
                    sparkle: Math.random() * 6,
                });
            }
            break;
        }

        case 'hay_dodge': {
            // Big round hay bale in one lane
            obstacles.push({
                type: 'haybale',
                lane: primaryLane,
                y: vanishY - 20,
                jumpable: true,
                slideable: false,
                hit: false,
            });
            // Powerup chance in one of the other lanes!
            if (Math.random() < 0.25) {
                spawnRandomPowerup(otherLanes[0], vanishY - 20);
            }
            // Coins in other lane
            const cLane = otherLanes[1] !== undefined ? otherLanes[1] : otherLanes[0];
            for (let i = 0; i < 3; i++) {
                coins.push({
                    lane: cLane,
                    y: vanishY - 10 - i * 35,
                    airborne: false,
                    collected: false,
                    sparkle: Math.random() * 6,
                });
            }
            break;
        }

        case 'barrier_slide': {
            // Tall clearance hurdle: MUST SLIDE UNDER!
            obstacles.push({
                type: 'barrier',
                lane: primaryLane,
                y: vanishY - 20,
                jumpable: false,
                slideable: true,
                hit: false,
            });
            // Low coins right underneath it to reward sliding!
            for (let i = 0; i < 2; i++) {
                coins.push({
                    lane: primaryLane,
                    y: vanishY - 20 + i * 20,
                    airborne: false,
                    slideReward: true,
                    collected: false,
                    sparkle: Math.random() * 6,
                });
            }
            break;
        }

        case 'tractor_warning': {
            // Big farm tractor: Cannot jump or slide, MUST DODGE LANE!
            obstacles.push({
                type: 'tractor',
                lane: primaryLane,
                y: vanishY - 30,
                jumpable: false,
                slideable: false,
                hit: false,
            });
            // Coins guide player safely into other lanes
            for (let l of otherLanes) {
                coins.push({
                    lane: l,
                    y: vanishY - 25,
                    airborne: false,
                    collected: false,
                    sparkle: Math.random() * 6,
                });
            }
            break;
        }

        case 'truck_dodge': {
            // Highway delivery truck
            obstacles.push({
                type: 'truck',
                lane: primaryLane,
                y: vanishY - 40,
                jumpable: false,
                slideable: false,
                hit: false,
            });
            break;
        }

        case 'mud_risk': {
            // Mud slows player down (stumble), lets Farmer Joe catch up!
            obstacles.push({
                type: 'mud',
                lane: primaryLane,
                y: vanishY - 15,
                jumpable: true,
                slideable: false,
                hit: false,
            });
            // Safe lane gets coins
            const sLane = otherLanes[0];
            for (let i = 0; i < 3; i++) {
                coins.push({
                    lane: sLane,
                    y: vanishY - 15 - i * 30,
                    airborne: false,
                    collected: false,
                    sparkle: Math.random() * 6,
                });
            }
            break;
        }

        case 'coin_spread': {
            // Full coin line across paths
            const count = 3 + Math.floor(Math.random() * 2);
            for (let i = 0; i < count; i++) {
                coins.push({
                    lane: primaryLane,
                    y: vanishY - 10 - i * 32,
                    airborne: false,
                    collected: false,
                    sparkle: Math.random() * 6,
                });
            }
            if (Math.random() < 0.35) {
                spawnRandomPowerup(otherLanes[0], vanishY - 30);
            }
            break;
        }

        default:
            break;
    }
}

function spawnRandomPowerup(lane, y) {
    const types = ['turbo', 'magnet', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    powerups.push({
        type,
        lane,
        y,
        collected: false,
        glow: 0,
    });
}

function spawnParticles(x, y, color, count = 5, speed = 3) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * speed * 2,
            vy: (Math.random() - 1) * speed,
            life: 1,
            decay: 0.02 + Math.random() * 0.03,
            size: 3 + Math.random() * 4,
            color,
        });
    }
}

function spawnFlyingText(text, x, y, color = '#FFF') {
    flyingTexts.push({
        text,
        x,
        y,
        vy: -1.5,
        alpha: 1,
        color,
    });
}

// ---- Actions ----
function moveLeft() {
    if (player.targetLane > 0) {
        player.targetLane--;
        sfxClick();
    }
}
function moveRight() {
    if (player.targetLane < 2) {
        player.targetLane++;
        sfxClick();
    }
}
function jump() {
    if (!player.jumping && !player.sliding) {
        player.jumping = true;
        player.jumpVel = -15.5;
        sfxJump();
        // Dust kickup
        spawnParticles(player.x, player.y + 15, '#A0875A', 6, 2.5);
    }
}
function slide() {
    if (!player.jumping && !player.sliding) {
        player.sliding = true;
        player.slideTimer = 32;
        sfxSlide();
        spawnParticles(player.x, player.y + 15, '#A0875A', 5, 2);
    }
}
function doMoo() {
    if (player.mooCooldown > 0) return;
    player.mooTimer = 45;
    player.mooCooldown = 180; // 3 seconds cooldown
    sfxMoo();

    // Shockwave particle effect
    spawnParticles(player.x, player.y - 25, COLORS.cowbellGold, 18, 5);
    spawnFlyingText("MOOOOOOO! 🎵", player.x, player.y - 70, COLORS.cowbellGold);

    // Distracts / slows pursuers (GDD Section 5)
    farmerJoe.stunnedTimer = 90;
    farmerJoe.closeness = Math.max(5, farmerJoe.closeness - 20);
    farmerJoe.shoutText = "Darn cow! Too loud! 🙉";
    farmerJoe.shoutTimer = 90;

    if (rover.active) {
        rover.stunnedTimer = 90;
        rover.barkText = "Whine... 🐕";
        rover.barkTimer = 90;
    }

    kiki.tipText = "Great Moo! Farmer Joe is startled! 🐦";
    kiki.tipTimer = 120;
}

// ---- Input Bindings (GDD Section 5) ----
document.addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    switch(e.key) {
        case 'ArrowLeft': case 'a': case 'A':
            moveLeft(); break;
        case 'ArrowRight': case 'd': case 'D':
            moveRight(); break;
        case 'ArrowUp': case 'w': case 'W': case ' ':
            e.preventDefault();
            jump(); break;
        case 'ArrowDown': case 's': case 'S':
            slide(); break;
        case 'f': case 'F':
            doMoo(); break;
        case 'Escape': case 'p': case 'P':
            pauseGame(); break;
    }
});

let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
document.addEventListener('touchstart', (e) => {
    if (state !== 'playing') return;
    initAudio();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (state !== 'playing') return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    if (dt > 500) return;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 15 && absDy < 15) {
        // Quick tap: MOO!
        doMoo();
        return;
    }

    if (absDx > 30 && absDx > absDy) {
        if (dx > 0) moveRight(); else moveLeft();
    } else if (absDy > 30 && absDy > absDx) {
        if (dy < 0) jump(); else slide();
    }
}, { passive: true });

// ---- Update Loop ----
function update(dt) {
    if (state !== 'playing') return;
    frameCount++;

    // Speed scales up 5% every 200m (GDD 3.6.7)
    const speedMult = 1 + Math.floor(distance / 200) * 0.05;
    gameSpeed = Math.min(BASE_SPEED * speedMult, MAX_SPEED);
    if (player.turboActive) gameSpeed = MAX_SPEED * 1.35;

    const metersDelta = gameSpeed * 0.16;
    distance += metersDelta;
    score = Math.floor(distance * 10 * scoreMultiplier);

    // -- Player Positioning & Physics --
    player.y = H() * PLAYER_Y_RATIO;
    const targetX = getLaneX(player.targetLane);
    player.x += (targetX - player.x) * 0.22;
    player.lane = player.targetLane;

    // Jumping physics
    if (player.jumping) {
        player.jumpVel += 0.88; // gravity
        player.jumpY += player.jumpVel;
        if (player.jumpY >= 0) {
            player.jumpY = 0;
            player.jumping = false;
            player.jumpVel = 0;
            spawnParticles(player.x, player.y + 15, '#A0875A', 4, 1.8);
        }
    }

    // Sliding physics
    if (player.sliding) {
        player.slideTimer--;
        if (player.slideTimer <= 0) player.sliding = false;
    }

    // Stumble
    if (player.stumbleTimer > 0) player.stumbleTimer--;
    if (player.mooTimer > 0) player.mooTimer--;
    if (player.mooCooldown > 0) player.mooCooldown--;

    // Leg anim
    player.animTimer++;
    if (player.animTimer > (player.turboActive ? 2 : 4)) {
        player.animFrame = (player.animFrame + 1) % 4;
        player.animTimer = 0;
    }

    // Power-up durations
    if (player.turboActive) {
        player.turboTimer -= dt;
        spawnParticles(player.x + (Math.random()-0.5)*30, player.y + 10, '#FFF', 2, 2);
        if (player.turboTimer <= 0) player.turboActive = false;
    }
    if (player.magnetActive) {
        player.magnetTimer -= dt;
        if (player.magnetTimer <= 0) player.magnetActive = false;
    }

    // -- Wave Spawning --
    if (distance >= nextSpawnDistance) {
        generateWave();
        // Distance gap between obstacle waves (gets slightly tighter at high speed)
        const gap = Math.max(35, 65 - distance * 0.01);
        nextSpawnDistance = distance + gap;
    }

    // -- Move Obstacles (Perspective acceleration) --
    const h = H();
    const vanishY = h * VANISH_Y_RATIO;

    for (let o of obstacles) {
        const t = getPerspectiveT(o.y);
        o.y += gameSpeed * (0.28 + t * 1.6);
    }
    obstacles = obstacles.filter(o => o.y < h + 150 && !o.hit);

    // -- Move Coins --
    for (let c of coins) {
        const t = getPerspectiveT(c.y);
        c.y += gameSpeed * (0.28 + t * 1.6);
        c.sparkle += 0.12;

        // Reset airborne once coins pass player so they settle naturally
        if (c.airborne && c.y > player.y + 35) {
            c.airborne = false;
        }

        // Magnet attraction
        if (player.magnetActive && !c.collected) {
            const scale = getScaleAtY(c.y);
            const airborneOffset = c.airborne ? (c.arcHeight || 36) * scale : 0;
            const coinVisualY = c.y - airborneOffset;
            const cx = getLaneXAtY(c.lane, coinVisualY);
            const dx = player.x - cx;
            const dy = (player.y + player.jumpY) - coinVisualY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 340) {
                c.y += dy * 0.22;
                // Move towards player lane
                if (Math.abs(dx) > 10) c.lane = player.lane;
            }
        }
    }
    coins = coins.filter(c => c.y < h + 30 && !c.collected);

    // -- Move Power-ups --
    for (let p of powerups) {
        const t = getPerspectiveT(p.y);
        p.y += gameSpeed * (0.28 + t * 1.6);
        p.glow += 0.1;
    }
    powerups = powerups.filter(p => p.y < h + 30 && !p.collected);

    // -- Particles Update --
    for (let p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.life -= p.decay;
    }
    particles = particles.filter(p => p.life > 0);

    // -- Flying Text Update --
    for (let ft of flyingTexts) {
        ft.y += ft.vy;
        ft.alpha -= 0.015;
    }
    flyingTexts = flyingTexts.filter(ft => ft.alpha > 0);

    // ==========================================
    // SEPARATED COLLISION DETECTION (No bugs!)
    // ==========================================

    // 1. COIN COLLECTION (Safe & Independent)
    for (let c of coins) {
        if (c.collected) continue;
        const scale = getScaleAtY(c.y);
        const airborneOffset = c.airborne ? (c.arcHeight || 36) * scale : 0;
        const coinVisualY = c.y - airborneOffset;
        const cx = getLaneXAtY(c.lane, coinVisualY);
        const playerActualY = player.y + player.jumpY;

        // X proximity: player must be in the same lane
        const xDist = Math.abs(player.x - cx);
        const yDist = Math.abs(playerActualY - coinVisualY);

        // If coin is airborne, player needs to be jumping near its height
        let heightMatch = true;
        if (c.airborne && (!player.jumping || player.jumpY > -15)) {
            heightMatch = false;
        }

        if (xDist < 55 && yDist < 50 && heightMatch) {
            c.collected = true;
            coinsCollected++;
            sfxCoin();
            spawnParticles(cx, coinVisualY, COLORS.strawYellow, 6, 3);
            spawnFlyingText("+1 🪙", cx, coinVisualY - 15, COLORS.strawYellow);
        }
    }

    // 2. POWER-UP COLLECTION (Safe & Independent)
    for (let p of powerups) {
        if (p.collected) continue;
        const px = getLaneXAtY(p.lane, p.y);
        const xDist = Math.abs(player.x - px);
        const yDist = Math.abs((player.y + player.jumpY) - p.y);

        if (xDist < 50 && yDist < 45) {
            p.collected = true;
            sfxPowerup();

            if (p.type === 'turbo') {
                player.turboActive = true;
                player.turboTimer = TURBO_DURATION;
                spawnFlyingText("TURBO MILK! ⚡🥛", player.x, player.y - 50, COLORS.skyBlue);
                kiki.tipText = "Turbo Milk! Blast through everything! 🥛💨";
                kiki.tipTimer = 150;
            } else if (p.type === 'magnet') {
                player.magnetActive = true;
                player.magnetTimer = MAGNET_DURATION;
                spawnFlyingText("COIN MAGNET! 🧲", player.x, player.y - 50, COLORS.cowbellGold);
                kiki.tipText = "Coin Magnet! All coins are yours! 🧲";
                kiki.tipTimer = 150;
            } else if (p.type === 'shield') {
                player.hasShield = true;
                document.getElementById('hudShield').style.display = 'block';
                spawnFlyingText("MILK SHIELD! 🛡️", player.x, player.y - 50, '#FFF');
                kiki.tipText = "Milk Shield active! 1 free hit! 🛡️";
                kiki.tipTimer = 150;
            }
        }
    }

    // 3. OBSTACLE COLLISION (Precise & Fair)
    for (let o of obstacles) {
        if (o.hit) continue;

        // Proximity check in Z/Y space
        const yDist = Math.abs(player.y - o.y);
        if (yDist > 30) continue; // Not close enough vertically

        // X check: player must be in the same lane
        const ox = getLaneXAtY(o.lane, o.y);
        if (Math.abs(player.x - ox) > 45) continue; // In a different lane

        // Check player avoidance moves:
        // Jumpable obstacles (Fences, Hay Bales): safe if player is jumping high enough
        if (o.jumpable && player.jumping && player.jumpY < -24) {
            continue; // Successfully jumped over!
        }

        // Slideable obstacles (Low Barriers): safe if player is currently sliding
        if (o.slideable && player.sliding) {
            continue; // Successfully slid underneath!
        }

        // TURBO MILK blasts right through!
        if (player.turboActive) {
            o.hit = true;
            sfxCrash();
            spawnParticles(ox, o.y, '#FFF', 15, 6);
            spawnFlyingText("SMASH! 💥", ox, o.y - 20, '#FFF');
            continue;
        }

        // MUD: does not instakill! Slows player down & lets Farmer Joe get closer
        if (o.type === 'mud') {
            o.hit = true;
            player.stumbleTimer = 45;
            farmerJoe.closeness = Math.min(92, farmerJoe.closeness + 25);
            farmerJoe.shoutText = "Gotcha slipping! 👨‍🌾";
            farmerJoe.shoutTimer = 90;
            sfxSlide();
            spawnParticles(ox, o.y, COLORS.mud, 12, 3);
            spawnFlyingText("SPLAT! MUD! 💦", player.x, player.y - 40, COLORS.mud);
            kiki.tipText = "Mud puddle! Farmer Joe is catching up! 🏃";
            kiki.tipTimer = 120;
            continue;
        }

        // SHIELD absorbs 1 collision hit!
        if (player.hasShield) {
            o.hit = true;
            player.hasShield = false;
            player.stumbleTimer = 35;
            document.getElementById('hudShield').style.display = 'none';
            sfxCrash();
            spawnParticles(ox, o.y, COLORS.skyBlue, 16, 5);
            spawnFlyingText("SHIELD BROKE! 🛡️💥", player.x, player.y - 40, COLORS.skyBlue);
            continue;
        }

        // Direct fatal collision
        o.hit = true;
        sfxCrash();
        spawnParticles(ox, o.y, COLORS.barnRed, 20, 6);
        gameOver(`Crashed into a ${o.type.toUpperCase()}!`);
        return;
    }

    // ==========================================
    // PURSUERS & NPCS (Faithful to GDD)
    // ==========================================

    // --- 1. Farmer Joe ---
    if (farmerJoe.stunnedTimer > 0) {
        farmerJoe.stunnedTimer--;
    } else {
        // Natural distance decay or approach
        if (player.stumbleTimer > 0) {
            farmerJoe.closeness += 0.45;
        } else if (player.turboActive) {
            farmerJoe.closeness = Math.max(5, farmerJoe.closeness - 2.5);
        } else {
            farmerJoe.closeness = Math.max(10, farmerJoe.closeness - 0.08);
        }

        // Net Throwing Attack (GDD 2.4 & 3.6.2)
        farmerJoe.throwTimer += dt;
        if (farmerJoe.throwTimer > 9 && distance > 80 && farmerJoe.closeness > 30) {
            farmerJoe.throwTimer = 0;
            farmerJoe.throwing = true;
            farmerJoe.throwAnim = 30;
            farmerJoe.shoutText = "Take this net! 🥅";
            farmerJoe.shoutTimer = 90;

            // Throw a net obstacle ahead in player's current lane!
            obstacles.push({
                type: 'fence', // jumpable net
                lane: player.lane,
                y: player.y - 200,
                jumpable: true,
                slideable: false,
                hit: false,
                isNet: true,
            });
            spawnFlyingText("NET INCOMING! ⚠️", player.x, player.y - 120, COLORS.barnRed);
        }
    }

    if (farmerJoe.throwAnim > 0) farmerJoe.throwAnim--;
    if (farmerJoe.shoutTimer > 0) farmerJoe.shoutTimer--;

    // Game Over if Farmer Joe catches Moo Moo
    if (farmerJoe.closeness >= 98) {
        sfxCrash();
        gameOver("Caught by Farmer Joe and his net! 👨‍🌾🥅");
        return;
    }

    // Farmer Joe follows Moo Moo's lane smoothly
    farmerJoe.lane = player.lane;
    farmerJoe.x += (player.x - farmerJoe.x) * 0.15;
    farmerJoe.y = player.y + 65 + (100 - farmerJoe.closeness) * 1.5;

    // --- 2. Rover the Dog (Starts at 500m - GDD 2.4) ---
    if (distance >= BIOME_HARVEST && !rover.active && Math.random() < 0.003) {
        rover.active = true;
        rover.lane = Math.floor(Math.random() * 3);
        rover.y = vanishY;
        rover.warning = true;
        rover.warningTimer = 90; // 1.5 seconds warning (GDD 3.6.3)
        rover.leaping = false;
        rover.barkText = "WOOF! WOOF! 🐕";
        rover.barkTimer = 90;
        sfxBark();
        kiki.tipText = "Rover is leaping! Jump or switch lane! 🐕";
        kiki.tipTimer = 120;
    }

    if (rover.active) {
        if (rover.warning) {
            rover.warningTimer--;
            if (rover.warningTimer <= 0) {
                rover.warning = false;
                rover.leaping = true;
                rover.lane = player.lane; // targets player's lane!
                rover.y = vanishY + 30;
            }
        } else if (rover.leaping) {
            if (rover.stunnedTimer > 0) {
                rover.stunnedTimer--;
            } else {
                const t = getPerspectiveT(rover.y);
                rover.y += gameSpeed * (0.4 + t * 1.8);
                rover.x = getLaneXAtY(rover.lane, rover.y);

                // Check collision with Moo Moo (adjusted to Rover's bigger muscular size)
                const yDist = Math.abs(player.y - rover.y);
                const xDist = Math.abs(player.x - rover.x);

                if (yDist < 35 && xDist < 54) {
                    if (player.jumping && player.jumpY < -20) {
                        // Leaped over Rover!
                        spawnFlyingText("VAULTED ROVER! 🐶✨", player.x, player.y - 40, COLORS.strawYellow);
                    } else if (player.turboActive) {
                        rover.active = false;
                        spawnParticles(rover.x, rover.y, COLORS.cowbellGold, 12, 4);
                    } else if (player.hasShield) {
                        player.hasShield = false;
                        rover.active = false;
                        document.getElementById('hudShield').style.display = 'none';
                        sfxCrash();
                    } else {
                        sfxCrash();
                        gameOver("Tackled by Rover the Dog! 🐕");
                        return;
                    }
                }

                if (rover.y > h + 120) rover.active = false;
            }
        }
        if (rover.barkTimer > 0) rover.barkTimer--;
    }

    // --- 3. Kiki the Pigeon (Guide NPC - GDD 2.5) ---
    kiki.x += ((player.x + 35) - kiki.x) * 0.12;
    kiki.y = (player.y - 85 + Math.sin(frameCount * 0.12) * 8);
    kiki.wingAngle = Math.sin(frameCount * 0.28) * 0.45;
    if (kiki.tipTimer > 0) kiki.tipTimer--;

    // Periodically show helpful guidance tips
    if (kiki.tipTimer <= 0 && Math.random() < 0.003) {
        const helpfulTips = [
            "Press F or Tap to MOO and stun Farmer Joe! 📢",
            "Jump over wooden fences and hay bales! 🏃",
            "Slide under the clearance banners! ⬇️",
            "Tractors can't be jumped - switch lanes! 🚜",
            "Turbo Milk smashes everything! 🥛💥",
            "Coins give you high scores and shop skins! 🪙",
        ];
        kiki.tipText = helpfulTips[Math.floor(Math.random() * helpfulTips.length)];
        kiki.tipTimer = 180;
    }

    // --- 4. Farm Helicopter (Boss - Level 3 at 1500m+) ---
    if (distance >= BIOME_HIGHWAY && !helicopter.active && Math.random() < 0.002) {
        helicopter.active = true;
        helicopter.x = W() / 2;
        helicopter.y = vanishY - 70;
        helicopter.dropTimer = 120;
        helicopter.drops = [];
        kiki.tipText = "Helicopter boss! Watch out for dropped nets! 🚁";
        kiki.tipTimer = 200;
    }

    if (helicopter.active) {
        helicopter.x += (getLaneXAtY(player.lane, vanishY) - helicopter.x) * 0.04;
        helicopter.dropTimer--;

        if (helicopter.dropTimer <= 0) {
            // Drop a heavy net trap
            helicopter.dropTimer = 220; // attack cooldown (GDD 3.6.3)
            const targetLane = Math.floor(Math.random() * 3);
            obstacles.push({
                type: 'barrier', // Net barricade
                lane: targetLane,
                y: vanishY + 10,
                jumpable: false,
                slideable: true,
                hit: false,
                isNet: true,
            });
            spawnFlyingText("NET DROPPED! 🚁🥅", getLaneXAtY(targetLane, vanishY + 20), vanishY + 20, COLORS.barnRed);
        }
    }

    // -- Update HUD --
    document.getElementById('hudDistance').textContent = Math.floor(distance) + 'm';
    document.getElementById('hudCoins').textContent = coinsCollected;

    const powerupEl = document.getElementById('hudPowerup');
    const fillEl = document.getElementById('powerupFill');
    const iconEl = document.getElementById('powerupIcon');
    if (player.turboActive) {
        powerupEl.style.display = 'flex';
        iconEl.textContent = '🥛';
        fillEl.style.width = (player.turboTimer / TURBO_DURATION * 100) + '%';
    } else if (player.magnetActive) {
        powerupEl.style.display = 'flex';
        iconEl.textContent = '🧲';
        fillEl.style.width = (player.magnetTimer / MAGNET_DURATION * 100) + '%';
    } else {
        powerupEl.style.display = 'none';
    }
}

// ==========================================
// RENDERING SYSTEM (Detailed 2D Cartoon Style)
// ==========================================

function draw() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);

    const colors = getBiomeColors();
    const biome = getCurrentBiome();
    const vanishY = h * VANISH_Y_RATIO;
    const cx = w / 2;

    // -- 1. Sky & Backdrop --
    const skyGrad = ctx.createLinearGradient(0, 0, 0, vanishY);
    skyGrad.addColorStop(0, colors.sky[0]);
    skyGrad.addColorStop(1, colors.sky[1]);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, vanishY + 5);

    // Sun / Cloud
    ctx.fillStyle = 'rgba(255, 245, 180, 0.6)';
    ctx.beginPath();
    ctx.arc(w * 0.85, vanishY * 0.45, 36, 0, Math.PI * 2);
    ctx.fill();

    // Horizon scenery
    drawHorizonScenery(w, h, vanishY, biome);

    // -- 2. Pasture / Ground outside road --
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, vanishY, w, h - vanishY);

    // -- 3. Road Surface with Perspective --
    const rBottomHalf = w * ROAD_BOTTOM_WIDTH / 2;
    const rTopHalf = w * ROAD_TOP_WIDTH / 2;
    const bLeft = cx - rBottomHalf, bRight = cx + rBottomHalf;
    const tLeft = cx - rTopHalf, tRight = cx + rTopHalf;

    // Asphalt / Dirt Road Body
    ctx.fillStyle = colors.road;
    ctx.beginPath();
    ctx.moveTo(bLeft, h);
    ctx.lineTo(tLeft, vanishY);
    ctx.lineTo(tRight, vanishY);
    ctx.lineTo(bRight, h);
    ctx.closePath();
    ctx.fill();

    // Road Edge Curbs / White border lines
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bLeft, h); ctx.lineTo(tLeft, vanishY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bRight, h); ctx.lineTo(tRight, vanishY); ctx.stroke();

    // 3-Lane dashed divider lines
    ctx.strokeStyle = colors.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 16]);
    for (let i = 1; i < LANE_COUNT; i++) {
        const frac = i / LANE_COUNT;
        const bx = bLeft + (bRight - bLeft) * frac;
        const tx = tLeft + (tRight - tLeft) * frac;
        ctx.beginPath();
        ctx.moveTo(bx, h);
        ctx.lineTo(tx, vanishY);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Animated road stripes (scrolling sensation)
    const stripeCount = 18;
    for (let i = 0; i < stripeCount; i++) {
        let rawT = ((i / stripeCount) + (frameCount * gameSpeed * 0.0014)) % 1;
        let t = rawT * rawT; // perspective curve
        let sy = vanishY + (h - vanishY) * t;
        let halfW = getRoadHalfWidth(sy);
        let laneW = (halfW * 2) / 3;

        ctx.fillStyle = colors.roadLine;
        ctx.globalAlpha = t * 0.8;
        for (let l = 1; l < 3; l++) {
            let dx = cx - halfW + laneW * l;
            ctx.fillRect(dx - 2, sy - 3 * t, 4, 12 * t);
        }
    }
    ctx.globalAlpha = 1;

    // -- 4. Collect & Sort All Renderable Objects (Z-Sorting) --
    let renderList = [];

    // Obstacles
    for (let o of obstacles) {
        if (o.y >= vanishY - 10 && o.y < h + 120) {
            renderList.push({ type: 'obstacle', obj: o, y: o.y });
        }
    }
    // Coins
    for (let c of coins) {
        if (!c.collected && c.y >= vanishY - 10 && c.y < h + 60) {
            renderList.push({ type: 'coin', obj: c, y: c.y });
        }
    }
    // Powerups
    for (let p of powerups) {
        if (!p.collected && p.y >= vanishY - 10 && p.y < h + 60) {
            renderList.push({ type: 'powerup', obj: p, y: p.y });
        }
    }
    // Rover
    if (rover.active && rover.leaping) {
        renderList.push({ type: 'rover', obj: rover, y: rover.y });
    }
    // Player (Moo Moo)
    renderList.push({ type: 'player', obj: player, y: player.y });

    // Farmer Joe (always runs behind player)
    if (farmerJoe.active) {
        renderList.push({ type: 'farmer', obj: farmerJoe, y: farmerJoe.y });
    }

    // Sort by Y ascending: furthest away drawn first
    renderList.sort((a, b) => a.y - b.y);

    // Draw sorted entities
    for (let item of renderList) {
        switch(item.type) {
            case 'obstacle': drawObstacle(item.obj); break;
            case 'coin':     drawCoin(item.obj); break;
            case 'powerup':  drawPowerup(item.obj); break;
            case 'rover':    drawRover(); break;
            case 'player':   drawMooMoo(); break;
            case 'farmer':   drawFarmerJoe(); break;
        }
    }

    // -- 5. Overhead Entities (Kiki, Helicopter, UI overlays) --
    // Kiki the Pigeon flies above Moo Moo
    drawKiki();

    // Helicopter in the sky
    if (helicopter.active) drawHelicopter(w, vanishY);

    // Rover Warning Icon when preparing to leap
    if (rover.active && rover.warning) {
        const rx = getLaneXAtY(rover.lane, h * 0.52);
        ctx.fillStyle = COLORS.barnRed;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ ROVER LEAPING! 🐕', rx, h * 0.48 + Math.sin(frameCount * 0.25) * 5);
    }

    // Flying Texts (+1, SMASH, etc)
    for (let ft of flyingTexts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 16px "Fredoka One", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    }

    // Particles
    for (let p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size * p.life), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Turbo Speed Lines
    if (player.turboActive) {
        ctx.fillStyle = 'rgba(78, 192, 233, 0.08)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
            const sx = player.x + (Math.random() - 0.5) * 140;
            const sy = player.y - Math.random() * h * 0.4;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx, sy + 40 + Math.random() * 30);
            ctx.stroke();
        }
    }

    // Danger Vignette when Farmer Joe is super close
    if (farmerJoe.closeness > 65) {
        const dangerAlpha = ((farmerJoe.closeness - 65) / 35) * 0.4;
        ctx.fillStyle = `rgba(217, 56, 58, ${dangerAlpha})`;
        ctx.fillRect(0, 0, w, h);
    }
}

// Scenery at horizon
function drawHorizonScenery(w, h, vanishY, biome) {
    if (biome === 'barnyard') {
        // Red Barn
        ctx.fillStyle = COLORS.barnRed;
        ctx.fillRect(w * 0.1, vanishY - 60, 80, 60);
        ctx.fillStyle = '#8B0000';
        ctx.beginPath();
        ctx.moveTo(w * 0.1 - 4, vanishY - 60);
        ctx.lineTo(w * 0.1 + 40, vanishY - 88);
        ctx.lineTo(w * 0.1 + 84, vanishY - 60);
        ctx.fill();
        // White X on barn door
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.1 + 25, vanishY - 35, 30, 35);
        ctx.beginPath(); ctx.moveTo(w*0.1+25, vanishY-35); ctx.lineTo(w*0.1+55, vanishY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w*0.1+55, vanishY-35); ctx.lineTo(w*0.1+25, vanishY); ctx.stroke();

        // Silo
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(w * 0.82, vanishY - 70, 26, 70);
        ctx.fillStyle = '#64748B';
        ctx.beginPath(); ctx.arc(w * 0.82 + 13, vanishY - 70, 13, Math.PI, 0); ctx.fill();

        // Green rolling trees
        for (let i = 0; i < 6; i++) {
            const tx = w * 0.25 + i * w * 0.1;
            ctx.fillStyle = '#15803D';
            ctx.beginPath(); ctx.arc(tx, vanishY - 18, 16, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#4B2E1E';
            ctx.fillRect(tx - 3, vanishY - 6, 6, 12);
        }
    } else if (biome === 'harvest') {
        // Windmill
        const wmx = w * 0.14;
        ctx.fillStyle = '#78350F';
        ctx.fillRect(wmx - 6, vanishY - 65, 12, 65);
        ctx.save();
        ctx.translate(wmx, vanishY - 65);
        ctx.rotate(frameCount * 0.03);
        ctx.fillStyle = '#B45309';
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.fillRect(-3, 0, 6, 28);
        }
        ctx.restore();

        // Golden cornfield stalks
        for (let i = 0; i < 10; i++) {
            const cx = w * 0.28 + i * w * 0.06;
            ctx.fillStyle = COLORS.strawYellow;
            ctx.fillRect(cx, vanishY - 14 - Math.sin(i)*6, 3, 20);
        }
    } else {
        // Highway roadside billboard & scenery
        ctx.fillStyle = '#64748B';
        ctx.fillRect(w * 0.76, vanishY - 60, 6, 60);
        ctx.fillStyle = '#16A34A';
        ctx.fillRect(w * 0.70, vanishY - 62, 95, 36);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.70, vanishY - 62, 95, 36);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 9px "Fredoka One", sans-serif';
        ctx.fillText('WILDLIFE SANCTUARY ➔', w * 0.71, vanishY - 45);
        ctx.font = '8px sans-serif';
        ctx.fillText('FREE COWS AHEAD 500M', w * 0.71, vanishY - 32);

        // Distant city / sanctuary mountains
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(0, vanishY);
        ctx.lineTo(w * 0.15, vanishY - 45);
        ctx.lineTo(w * 0.35, vanishY);
        ctx.lineTo(w * 0.5, vanishY - 35);
        ctx.lineTo(w * 0.65, vanishY);
        ctx.closePath();
        ctx.fill();
    }
}

// ==========================================
// DRAW CHARACTERS & ASSETS
// ==========================================

// 1. MOO MOO (Player Cow) - Expressive Cartoon Cow
function drawMooMoo() {
    const px = player.x;
    const py = player.y + player.jumpY;
    const isSliding = player.sliding;
    const isTurbo = player.turboActive;
    const legPhase = player.animFrame;

    ctx.save();
    ctx.translate(px, py);

    // Moo Shockwave
    if (player.mooTimer > 0) {
        ctx.strokeStyle = `rgba(232, 169, 35, ${player.mooTimer / 45})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, -25, 45 + (45 - player.mooTimer) * 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Turbo Aura & Speed Lines
    if (isTurbo) {
        ctx.fillStyle = 'rgba(78, 192, 233, 0.25)';
        ctx.beginPath();
        ctx.arc(0, -20, 52, 0, Math.PI * 2);
        ctx.fill();
    }

    // Milk Shield Bubble
    if (player.hasShield) {
        ctx.strokeStyle = 'rgba(78, 192, 233, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -20, 48, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Shadow
    const shadowScale = player.jumping ? Math.max(0.4, 1 - Math.abs(player.jumpY) / 120) : 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 20 - player.jumpY, 32 * shadowScale, 9 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Slide transformation
    if (isSliding) {
        ctx.translate(0, 16);
        ctx.scale(1.3, 0.45);
    }

    const bounce = player.jumping ? 0 : Math.sin(legPhase * Math.PI) * 4;

    // -- Cow Body --
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#27272A';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.ellipse(0, -10 - bounce, 30, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Black Cow Patches (Organic spots)
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.ellipse(-12, -18 - bounce, 11, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(14, -6 - bounce, 9, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-8, 3 - bounce, 7, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Swishing Tail
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 3;
    const tailWag = Math.sin(frameCount * 0.2) * 12;
    ctx.beginPath();
    ctx.moveTo(0, 6 - bounce);
    ctx.quadraticCurveTo(tailWag, 2 - bounce, tailWag * 1.3, -12 - bounce);
    ctx.stroke();
    // Tail tuft
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.arc(tailWag * 1.3, -12 - bounce, 5, 0, Math.PI * 2);
    ctx.fill();

    // -- Cow Head --
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#27272A';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -36 - bounce, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears
    const earFlap = Math.sin(frameCount * 0.18) * 3;
    ctx.fillStyle = '#F4F4F5';
    ctx.beginPath();
    ctx.ellipse(-16, -46 - bounce + earFlap, 9, 6, -0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(16, -46 - bounce - earFlap, 9, 6, 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Little Horns
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#CA8A04';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-10, -52 - bounce); ctx.lineTo(-14, -64 - bounce); ctx.lineTo(-6, -53 - bounce); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -52 - bounce); ctx.lineTo(14, -64 - bounce); ctx.lineTo(6, -53 - bounce); ctx.fill(); ctx.stroke();

    // Pink Cow Muzzle / Snout
    ctx.fillStyle = '#FBCFE8';
    ctx.strokeStyle = '#F472B6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -29 - bounce, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Nostrils
    ctx.fillStyle = '#BE185D';
    ctx.beginPath(); ctx.arc(-4, -28 - bounce, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -28 - bounce, 2.5, 0, Math.PI * 2); ctx.fill();

    // Big Cartoon Eyes
    ctx.fillStyle = '#18181B';
    ctx.beginPath(); ctx.arc(-8, -42 - bounce, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -42 - bounce, 4, 0, Math.PI * 2); ctx.fill();
    // Catchlight
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-6.5, -43.5 - bounce, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(9.5, -43.5 - bounce, 1.8, 0, Math.PI * 2); ctx.fill();

    // Red Collar & Golden Bell
    ctx.fillStyle = COLORS.barnRed;
    ctx.fillRect(-12, -21 - bounce, 24, 4);
    // Cowbell
    ctx.fillStyle = COLORS.cowbellGold;
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 1.5;
    const bellSway = Math.sin(frameCount * 0.2) * 4;
    ctx.beginPath();
    ctx.arc(bellSway, -14 - bounce, 6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // 4 Animated Running Legs
    const fLeg = Math.sin(legPhase * Math.PI) * 9;
    const bLeg = -fLeg;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#27272A';
    ctx.lineWidth = 2;
    // Front pair
    ctx.fillRect(-14, 10 - bounce, 7, 16 + fLeg); ctx.strokeRect(-14, 10 - bounce, 7, 16 + fLeg);
    ctx.fillRect(7, 10 - bounce, 7, 16 + bLeg); ctx.strokeRect(7, 10 - bounce, 7, 16 + bLeg);
    // Black Hooves
    ctx.fillStyle = '#18181B';
    ctx.fillRect(-15, 24 - bounce + fLeg, 9, 4);
    ctx.fillRect(6, 24 - bounce + bLeg, 9, 4);

    // Special Skins
    if (activeSkin === 'golden') {
        ctx.fillStyle = 'rgba(234, 179, 8, 0.45)';
        ctx.beginPath(); ctx.ellipse(0, -10 - bounce, 30, 24, 0, 0, Math.PI * 2); ctx.fill();
    } else if (activeSkin === 'superhero') {
        // Red superhero cape waving behind
        ctx.fillStyle = COLORS.barnRed;
        ctx.beginPath();
        ctx.moveTo(-10, -20 - bounce);
        ctx.lineTo(-26 + Math.sin(frameCount*0.3)*6, 14 - bounce);
        ctx.lineTo(26 + Math.sin(frameCount*0.3)*6, 14 - bounce);
        ctx.lineTo(10, -20 - bounce);
        ctx.closePath();
        ctx.fill();
    } else if (activeSkin === 'wizard') {
        // Purple Wizard Hat
        ctx.fillStyle = '#6B21A8';
        ctx.beginPath();
        ctx.moveTo(0, -80 - bounce);
        ctx.lineTo(-18, -50 - bounce);
        ctx.lineTo(18, -50 - bounce);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = COLORS.cowbellGold;
        ctx.beginPath(); ctx.arc(0, -62 - bounce, 4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
}

// 2. FARMER JOE - Furious Pursuer running behind Moo Moo
function drawFarmerJoe() {
    const fx = farmerJoe.x;
    const fy = farmerJoe.y;
    const isThrowing = farmerJoe.throwing;
    const isStunned = farmerJoe.stunnedTimer > 0;
    const runCycle = Math.sin(frameCount * 0.28) * 8;

    ctx.save();
    ctx.translate(fx, fy);

    // Closeness indicator label
    ctx.fillStyle = farmerJoe.closeness > 75 ? COLORS.barnRed : '#FFFFFF';
    ctx.font = 'bold 13px "Fredoka One", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`👨‍🌾 Farmer Joe (${Math.floor(farmerJoe.closeness)}%)`, 0, -68);

    // Speech bubble from Farmer Joe
    if (farmerJoe.shoutTimer > 0 && farmerJoe.shoutText) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#18181B';
        ctx.lineWidth = 2;
        drawBubbleRect(-80, -105, 160, 28, 8);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#18181B';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(farmerJoe.shoutText, 0, -87);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isStunned) {
        // Dizzy stars
        ctx.font = '16px sans-serif';
        ctx.fillText('💫 ⭐ 💫', 0, -60);
        ctx.rotate(Math.sin(frameCount * 0.4) * 0.15);
    }

    // Farmer Boots & Running Legs
    ctx.fillStyle = '#1D4ED8'; // Denim blue overalls legs
    ctx.fillRect(-12, 0, 8, 16 + runCycle);
    ctx.fillRect(4, 0, 8, 16 - runCycle);
    ctx.fillStyle = '#78350F'; // Brown workboots
    ctx.fillRect(-14, 14 + runCycle, 11, 6);
    ctx.fillRect(3, 14 - runCycle, 11, 6);

    // Overalls Torso
    ctx.fillStyle = COLORS.barnRed; // Red flannel shirt
    ctx.fillRect(-15, -28, 30, 20);
    // Blue dungaree bib
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(-11, -22, 22, 22);
    // Yellow brass buckles
    ctx.fillStyle = '#FDE047';
    ctx.beginPath(); ctx.arc(-8, -20, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -20, 2.5, 0, Math.PI*2); ctx.fill();

    // Farmer Head
    ctx.fillStyle = '#FED7AA'; // Skin
    ctx.beginPath(); ctx.arc(0, -38, 12, 0, Math.PI * 2); ctx.fill();

    // Angry Eyebrows & Eyes
    ctx.fillStyle = '#18181B';
    ctx.beginPath(); ctx.arc(-4, -40, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -40, 2, 0, Math.PI*2); ctx.fill();
    // Bushy Mustache
    ctx.fillStyle = '#78350F';
    ctx.beginPath(); ctx.ellipse(0, -34, 8, 4, 0, 0, Math.PI*2); ctx.fill();

    // Straw Hat
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#CA8A04';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, -46, 22, 7, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillRect(-12, -58, 24, 14); ctx.strokeRect(-12, -58, 24, 14);
    // Red hat ribbon
    ctx.fillStyle = COLORS.barnRed;
    ctx.fillRect(-12, -49, 24, 4);

    // Long Pole with Butterfly / Catching Net
    ctx.save();
    const netSwing = isThrowing ? -0.8 : Math.sin(frameCount * 0.2) * 0.2;
    ctx.translate(14, -20);
    ctx.rotate(netSwing);
    // Wooden pole
    ctx.fillStyle = '#92400E';
    ctx.fillRect(0, -35, 4, 45);
    // Net rim
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(2, -38, 15, 0, Math.PI * 2);
    ctx.stroke();
    // Mesh net
    ctx.fillStyle = 'rgba(254, 243, 199, 0.4)';
    ctx.beginPath();
    ctx.arc(2, -38, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
}

// 3. ROVER THE DOG - Elite Farm Herding Dog (Big, Fierce & Agile)
function drawRover() {
    const rx = rover.x;
    const ry = rover.y;
    const laneW = getLaneWidthAtY(ry);
    // Scale proportionally with lane width so Rover is big and clearly visible!
    const scale = Math.max(0.65, (laneW / 180));
    const runCycle = Math.sin(frameCount * 0.45) * 10;
    const leapAngle = rover.leaping ? Math.sin(frameCount * 0.2) * 0.15 : 0;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(scale, scale);
    ctx.rotate(leapAngle);

    // Bark speech bubble
    if (rover.barkTimer > 0 && rover.barkText) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = COLORS.barnRed;
        ctx.lineWidth = 2.5;
        drawBubbleRect(-65, -95, 130, 32, 10);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = COLORS.barnRed;
        ctx.font = 'bold 14px "Fredoka One", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rover.barkText, 0, -74);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 38, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // -- Dog Body (Muscular Border Collie / Australian Shepherd) --
    // Chocolate brown & deep black coat
    ctx.fillStyle = '#451A03';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 24, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // White fur patch / saddle patch
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.ellipse(10, 4, 16, 18, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Fluffy white chest mane / ruff
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(18, -2, 15, 16, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // -- 4 Muscular Running/Leaping Legs with Paws --
    ctx.fillStyle = '#451A03';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    // Front Legs
    ctx.fillRect(8, 12, 9, 20 + runCycle);
    ctx.strokeRect(8, 12, 9, 20 + runCycle);
    ctx.fillRect(20, 12, 9, 20 - runCycle);
    ctx.strokeRect(20, 12, 9, 20 - runCycle);
    // Back Legs
    ctx.fillRect(-26, 10, 10, 22 - runCycle);
    ctx.strokeRect(-26, 10, 10, 22 - runCycle);
    ctx.fillRect(-14, 10, 10, 22 + runCycle);
    ctx.strokeRect(-14, 10, 10, 22 + runCycle);

    // White Socks on Paws
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(7, 26 + runCycle, 11, 8);
    ctx.fillRect(19, 26 - runCycle, 11, 8);
    ctx.fillRect(-27, 26 - runCycle, 12, 8);
    ctx.fillRect(-15, 26 + runCycle, 12, 8);

    // -- Big Bushy Tail with White Plume Tip --
    const tailWag = Math.sin(frameCount * 0.45) * 14;
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-32, -4);
    ctx.quadraticCurveTo(-48, -16 + tailWag, -56, -8 + tailWag);
    ctx.stroke();
    // White plume tip
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-52, -10 + tailWag);
    ctx.lineTo(-64, -6 + tailWag);
    ctx.stroke();

    // -- Dog Head & Neck --
    ctx.fillStyle = '#451A03';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(26, -18, 18, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // White blaze stripe running up the snout & forehead
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(22, -34);
    ctx.lineTo(28, -34);
    ctx.lineTo(34, -14);
    ctx.lineTo(20, -14);
    ctx.closePath();
    ctx.fill();

    // Snout / Muzzle
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(36, -14, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Glistening Black Nose
    ctx.fillStyle = '#18181B';
    ctx.beginPath(); ctx.arc(43, -16, 4.5, 0, Math.PI * 2); ctx.fill();

    // Open Happy/Fierce Mouth with Pink Lolling Tongue
    ctx.fillStyle = '#BE123C'; // Mouth interior
    ctx.beginPath(); ctx.ellipse(38, -8, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Pink Tongue
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.ellipse(39, -5 + Math.sin(frameCount * 0.3) * 2, 5, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Expressive Cartoon Eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(26, -24, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#18181B';
    ctx.beginPath(); ctx.arc(27.5, -24, 2.5, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(26.5, -25.5, 1.2, 0, Math.PI * 2); ctx.fill();

    // Perked Alert Ears
    ctx.fillStyle = '#290E02';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    // Left Ear
    ctx.beginPath();
    ctx.moveTo(18, -32); ctx.lineTo(14, -48); ctx.lineTo(28, -34);
    ctx.fill(); ctx.stroke();
    // Right Ear
    ctx.beginPath();
    ctx.moveTo(28, -34); ctx.lineTo(32, -49); ctx.lineTo(38, -30);
    ctx.fill(); ctx.stroke();
    // Pink inner ear
    ctx.fillStyle = '#FBCFE8';
    ctx.beginPath(); ctx.moveTo(20, -33); ctx.lineTo(16, -44); ctx.lineTo(26, -34); ctx.fill();

    // Red Studded Collar with Golden Tag
    ctx.fillStyle = COLORS.barnRed;
    ctx.fillRect(16, -7, 7, 16);
    // Golden bone tag
    ctx.fillStyle = COLORS.cowbellGold;
    ctx.beginPath(); ctx.arc(19, 10, 4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

// 4. KIKI THE PIGEON - Animated Guide NPC flying above Moo Moo
function drawKiki() {
    const kx = kiki.x;
    const ky = kiki.y;
    const wingAngle = kiki.wingAngle;

    ctx.save();
    ctx.translate(kx, ky);

    // Kiki Speech Bubble (When giving tips)
    if (kiki.tipTimer > 0 && kiki.tipText) {
        ctx.font = 'bold 13px "Fredoka One", sans-serif';
        const textW = ctx.measureText(kiki.tipText).width;
        const boxW = Math.max(160, textW + 28);
        const boxH = 34;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.5;
        drawBubbleRect(-boxW / 2, -55, boxW, boxH, 12);
        ctx.fill(); ctx.stroke();

        // Speech bubble pointer tail
        ctx.beginPath();
        ctx.moveTo(-6, -21); ctx.lineTo(0, -12); ctx.lineTo(6, -21);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'center';
        ctx.fillText(kiki.tipText, 0, -33);
    }

    // Shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.beginPath();
    ctx.ellipse(0, 85, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pigeon Body (Grey and White)
    ctx.fillStyle = '#64748B'; // slate grey
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); ctx.fill();

    // Iridescent Neck (Emerald Green)
    ctx.fillStyle = '#10B981';
    ctx.beginPath(); ctx.ellipse(6, -4, 6, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Pigeon Head
    ctx.fillStyle = '#64748B';
    ctx.beginPath(); ctx.arc(12, -7, 7, 0, Math.PI * 2); ctx.fill();
    // Eye
    ctx.fillStyle = '#F97316'; // Orange eye
    ctx.beginPath(); ctx.arc(13.5, -8.5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(14, -8.5, 1.2, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath(); ctx.moveTo(17, -8); ctx.lineTo(23, -6); ctx.lineTo(17, -4); ctx.fill();

    // Flapping Wings
    ctx.save();
    ctx.translate(-2, -4);
    ctx.rotate(wingAngle);
    ctx.fillStyle = '#94A3B8';
    ctx.beginPath(); ctx.ellipse(0, -8, 7, 14, -0.2, 0, Math.PI * 2); ctx.fill();
    // White wing bars
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, -6); ctx.stroke();
    ctx.restore();

    // Pink Feet
    ctx.fillStyle = '#FB7185';
    ctx.fillRect(-2, 7, 2, 4); ctx.fillRect(4, 7, 2, 4);

    ctx.restore();
}

// 5. FARM HELICOPTER (Boss) - High-Tech Farm Patrol Helicopter
function drawHelicopter(w, vanishY) {
    const hx = helicopter.x;
    const hy = Math.max(70, vanishY - 70 + Math.sin(frameCount * 0.06) * 12);
    const tilt = Math.max(-0.14, Math.min(0.14, (getLaneXAtY(player.lane, vanishY) - hx) * 0.002));
    const rotorAngle = frameCount * 0.6;
    const tailRotorAngle = frameCount * 0.8;
    const isFlashingRed = (Math.floor(frameCount / 14) % 2 === 0);

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(tilt);

    // ===================================
    // 1. MEGA SEARCHLIGHT (Volumetric Beam)
    // ===================================
    const beamTargetX = (getLaneXAtY(player.lane, H() * 0.72) - hx);
    const lightGrad = ctx.createLinearGradient(0, 20, beamTargetX, H() * 0.65);
    lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
    lightGrad.addColorStop(0.3, 'rgba(253, 224, 71, 0.22)');
    lightGrad.addColorStop(1, 'rgba(250, 204, 21, 0.01)');

    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.moveTo(-15, 20);
    ctx.lineTo(beamTargetX - 75, H() * 0.65);
    ctx.lineTo(beamTargetX + 75, H() * 0.65);
    ctx.lineTo(15, 20);
    ctx.closePath();
    ctx.fill();

    // Spotlight pool on the road
    ctx.save();
    ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
    ctx.beginPath();
    ctx.ellipse(beamTargetX, H() * 0.65, 80, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ===================================
    // 2. LANDING SKIDS & STRUTS
    // ===================================
    ctx.strokeStyle = '#64748B'; // slate steel
    ctx.lineWidth = 3.5;
    // Front and rear struts
    ctx.beginPath();
    ctx.moveTo(-25, 12); ctx.lineTo(-32, 34);
    ctx.moveTo(15, 12); ctx.lineTo(10, 34);
    ctx.moveTo(-10, 12); ctx.lineTo(-14, 34);
    ctx.moveTo(30, 12); ctx.lineTo(26, 34);
    ctx.stroke();

    // Tubular skids with curved tips
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    // Left skid
    ctx.beginPath();
    ctx.moveTo(-52, 30);
    ctx.lineTo(-48, 34);
    ctx.lineTo(40, 34);
    ctx.stroke();
    // Right skid (offset slightly for 3D depth)
    ctx.beginPath();
    ctx.moveTo(-45, 38);
    ctx.lineTo(-40, 41);
    ctx.lineTo(46, 41);
    ctx.stroke();

    // ===================================
    // 3. TAIL BOOM & TAIL ROTOR
    // ===================================
    // Sleek aerodynamic tail boom
    ctx.fillStyle = '#0F172A'; // deep navy
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(35, -4);
    ctx.lineTo(95, -12);
    ctx.lineTo(110, -28); // vertical fin top
    ctx.lineTo(118, -26);
    ctx.lineTo(105, 4);
    ctx.lineTo(35, 10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Yellow hazard stripe on tail
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(60, -7); ctx.lineTo(72, -9); ctx.lineTo(70, 7); ctx.lineTo(58, 8);
    ctx.closePath(); ctx.fill();

    // Horizontal stabilizer winglet
    ctx.fillStyle = '#1E3A8A';
    ctx.fillRect(80, -14, 18, 4);

    // Spinning Tail Rotor
    ctx.save();
    ctx.translate(112, -22);
    // Rotor hub
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    // Spinning blur disc
    ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    // Tail rotor blades with red tips
    ctx.rotate(tailRotorAngle);
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-16, -1.5, 4, 3);
    ctx.fillRect(12, -1.5, 4, 3);
    ctx.restore();

    // ===================================
    // 4. MAIN FUSELAGE / CABIN
    // ===================================
    // Heavy turbine engine cowling (top)
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-20, -24, 52, 14);
    // Chrome exhaust pipes
    ctx.fillStyle = '#475569';
    ctx.fillRect(26, -20, 10, 6);
    ctx.fillStyle = '#334155';
    ctx.beginPath(); ctx.arc(36, -17, 3, 0, Math.PI * 2); ctx.fill();

    // Main Cabin Body
    const cabinGrad = ctx.createLinearGradient(0, -20, 0, 22);
    cabinGrad.addColorStop(0, '#1E3A8A'); // Police Royal Navy
    cabinGrad.addColorStop(0.5, '#0F172A');
    cabinGrad.addColorStop(1, '#020617');
    ctx.fillStyle = cabinGrad;
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(-50, -4);
    ctx.quadraticCurveTo(-45, -20, -10, -20);
    ctx.lineTo(40, -18);
    ctx.quadraticCurveTo(48, 0, 40, 16);
    ctx.lineTo(-25, 18);
    ctx.quadraticCurveTo(-55, 14, -50, -4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Gold Police Badge Star & "POLICE" Decal
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-15, 0, 48, 5); // gold side stripe
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 9px "Fredoka One", sans-serif';
    ctx.fillText('FARM POLICE', 8, -4);

    // ===================================
    // 5. CANOPY (Cockpit Glass & Pilot)
    // ===================================
    const glassGrad = ctx.createLinearGradient(-48, -14, -15, 12);
    glassGrad.addColorStop(0, 'rgba(56, 189, 248, 0.9)'); // bright cyan
    glassGrad.addColorStop(0.6, 'rgba(14, 116, 144, 0.85)');
    glassGrad.addColorStop(1, 'rgba(3, 105, 161, 0.95)');

    ctx.fillStyle = glassGrad;
    ctx.strokeStyle = '#E0F2FE';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-48, -4);
    ctx.quadraticCurveTo(-44, -16, -20, -16);
    ctx.lineTo(-12, -16);
    ctx.lineTo(-12, 10);
    ctx.quadraticCurveTo(-38, 12, -48, -4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Windshield Gloss Glare Arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-44, -2);
    ctx.quadraticCurveTo(-38, -12, -24, -12);
    ctx.stroke();

    // Pilot Silhouette inside cockpit (Headset & Shades)
    ctx.fillStyle = '#0F172A';
    ctx.beginPath(); ctx.arc(-24, -2, 6, 0, Math.PI * 2); ctx.fill(); // head
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-27, -4, 5, 2); // sunglasses
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-28, -6, 2, 7); // headset earcups
    ctx.fillRect(-20, -6, 2, 7);

    // ===================================
    // 6. NET LAUNCHER CANNON
    // ===================================
    ctx.fillStyle = '#475569';
    ctx.fillRect(-18, 14, 24, 7);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-22, 15, 6, 5); // muzzle
    // Laser sight targeting line
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(-22, 17);
    ctx.lineTo(beamTargetX, H() * 0.65);
    ctx.stroke();
    ctx.setLineDash([]);

    // ===================================
    // 7. SIREN BEACON FLASHER (Red & Blue)
    // ===================================
    // Top beacon
    ctx.fillStyle = isFlashingRed ? '#EF4444' : '#3B82F6';
    ctx.beginPath(); ctx.arc(-5, -27, 4, 0, Math.PI * 2); ctx.fill();
    // Flare glow
    ctx.fillStyle = isFlashingRed ? 'rgba(239, 68, 68, 0.45)' : 'rgba(59, 130, 246, 0.45)';
    ctx.beginPath(); ctx.arc(-5, -27, 10, 0, Math.PI * 2); ctx.fill();

    // Belly beacon
    ctx.fillStyle = !isFlashingRed ? '#EF4444' : '#3B82F6';
    ctx.beginPath(); ctx.arc(10, 20, 3.5, 0, Math.PI * 2); ctx.fill();

    // ===================================
    // 8. MAIN ROTOR MAST & SPINNING DISCS
    // ===================================
    // Rotor Mast shaft
    ctx.fillStyle = '#64748B';
    ctx.fillRect(-6, -34, 8, 12);
    // Swashplate disc
    ctx.fillStyle = '#475569';
    ctx.fillRect(-12, -30, 20, 4);

    // Rotor Hub
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath(); ctx.arc(-2, -34, 6, 0, Math.PI * 2); ctx.fill();

    // Motion Blurred Rotor Disc
    ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-2, -34, 78, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Twin Carbon Blades with Red & Yellow Tips
    ctx.save();
    ctx.translate(-2, -34);
    ctx.rotate(rotorAngle);

    // Blades
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-76, -3, 152, 6);

    // Yellow safety warning stripes on tips
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-76, -3, 12, 6);
    ctx.fillRect(64, -3, 12, 6);

    // Red warning tip ends
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-76, -3, 4, 6);
    ctx.fillRect(72, -3, 4, 6);
    ctx.restore();

    ctx.restore();

    // ===================================
    // 9. BOSS ENCOUNTER BANNER (Overhead)
    // ===================================
    ctx.save();
    const bannerW = 270;
    const bannerH = 32;
    const bannerX = hx - bannerW / 2;
    const bannerY = Math.max(16, hy - 65);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = isFlashingRed ? '#EF4444' : '#F59E0B';
    ctx.lineWidth = 2.5;
    drawBubbleRect(bannerX, bannerY, bannerW, bannerH, 8);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#FEF08A';
    ctx.font = 'bold 12px "Fredoka One", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚨 BOSS: FARM PATROL HELICOPTER 🚁', hx, bannerY + 21);
    ctx.restore();
}

// ==========================================
// DRAW LARGE, BOLD OBSTACLES (Proper Lane Scaling!)
// ==========================================

function drawObstacle(o) {
    const scale = getScaleAtY(o.y);
    const x = getLaneXAtY(o.lane, o.y);
    const y = o.y;
    const laneW = getLaneWidthAtY(y);

    ctx.save();
    ctx.translate(x, y);

    switch(o.type) {
        case 'fence': {
            // Natural 3D Wooden Farm Fence: Height is 52% of width (Never gepeng/squashed!)
            const w = laneW * 0.84;
            const h = w * 0.52;

            // Horizontal timber rails
            ctx.fillStyle = '#92400E';
            const railH = h * 0.16;
            ctx.fillRect(-w / 2, -h * 0.45, w, railH);
            ctx.fillRect(-w / 2, h * 0.12, w, railH);

            // Vertical pointed pickets (5 pickets across lane)
            const pickets = 5;
            const pw = w * 0.13;
            for (let i = 0; i < pickets; i++) {
                const px = -w / 2 + pw / 2 + (w - pw) / (pickets - 1) * i;
                ctx.fillStyle = '#B45309';
                ctx.fillRect(px - pw / 2, -h * 0.75, pw, h * 1.1);
                // Pointed top
                ctx.beginPath();
                ctx.moveTo(px - pw / 2, -h * 0.75);
                ctx.lineTo(px, -h * 1.0);
                ctx.lineTo(px + pw / 2, -h * 0.75);
                ctx.fill();
            }

            // "JUMP ⬆️" badge on fence
            if (scale > 0.35) {
                ctx.fillStyle = '#FEF08A';
                ctx.font = `bold ${Math.max(12, Math.floor(h * 0.28))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('JUMP ⬆️', 0, -h * 1.08);
            }
            break;
        }

        case 'haybale': {
            // Authentic 3D Farm Hay Bale Roll (Gulungan Jerami Padi - Jumpable)
            const w = laneW * 0.82;
            const h = w * 0.58;

            // Ground shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.beginPath();
            ctx.ellipse(0, h * 0.38, w * 0.48, h * 0.20, 0, 0, Math.PI * 2);
            ctx.fill();

            // 1. Cylindrical Hay Body (Golden Amber Straw Gradient)
            const bodyGrad = ctx.createLinearGradient(0, -h * 0.75, 0, h * 0.35);
            bodyGrad.addColorStop(0, '#FEF08A'); // bright straw highlight on top
            bodyGrad.addColorStop(0.3, '#EAB308'); // rich golden straw
            bodyGrad.addColorStop(0.8, '#CA8A04'); // deep amber
            bodyGrad.addColorStop(1, '#854D0E');   // shadow base

            ctx.fillStyle = bodyGrad;
            ctx.strokeStyle = '#713F12';
            ctx.lineWidth = Math.max(2, w * 0.022);

            // Rounded 3D Hay Bale shape
            drawBubbleRect(-w / 2, -h * 0.7, w, h, Math.floor(h * 0.32));
            ctx.fill(); ctx.stroke();

            // 2. Straw Texture Lines (Horizontal bundled fibers)
            ctx.strokeStyle = '#A16207';
            ctx.lineWidth = Math.max(1.5, w * 0.012);
            for (let i = -h * 0.5; i < h * 0.2; i += h * 0.14) {
                ctx.beginPath();
                ctx.moveTo(-w * 0.44, i + Math.sin(i * 10) * 2);
                ctx.lineTo(w * 0.44, i + Math.cos(i * 10) * 2);
                ctx.stroke();
            }

            // 3. Two Black/Brown Twine Binder Ropes (Tali Pengikat Jerami)
            ctx.strokeStyle = '#291807';
            ctx.lineWidth = Math.max(2.5, w * 0.025);
            // Left binding rope
            ctx.beginPath();
            ctx.moveTo(-w * 0.22, -h * 0.7);
            ctx.lineTo(-w * 0.22, h * 0.3);
            ctx.stroke();
            // Right binding rope
            ctx.beginPath();
            ctx.moveTo(w * 0.22, -h * 0.7);
            ctx.lineTo(w * 0.22, h * 0.3);
            ctx.stroke();

            // Knots on twine
            ctx.fillStyle = '#1C0F04';
            ctx.beginPath(); ctx.arc(-w * 0.22, -h * 0.2, Math.max(2, w * 0.02), 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(w * 0.22, -h * 0.2, Math.max(2, w * 0.02), 0, Math.PI*2); ctx.fill();

            // 4. Loose Straw Wisps (Grass strands poking out)
            ctx.strokeStyle = '#FDE047';
            ctx.lineWidth = Math.max(1.5, w * 0.014);
            // Top wisps
            for (let xPos = -w * 0.35; xPos <= w * 0.35; xPos += w * 0.14) {
                ctx.beginPath();
                ctx.moveTo(xPos, -h * 0.7);
                ctx.lineTo(xPos + (Math.sin(xPos) * 8), -h * 0.7 - Math.max(5, h * 0.14));
                ctx.stroke();
            }
            // Side wisps
            ctx.beginPath();
            ctx.moveTo(-w / 2, -h * 0.1); ctx.lineTo(-w / 2 - 8, -h * 0.15);
            ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2 - 6, 4);
            ctx.moveTo(w / 2, -h * 0.1); ctx.lineTo(w / 2 + 8, -h * 0.15);
            ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 + 6, 4);
            ctx.stroke();

            // 5. Floating Label: "JUMP ⬆️ HAY BALE 🌾"
            if (scale > 0.32) {
                ctx.fillStyle = '#FEF08A';
                ctx.font = `bold ${Math.max(11, Math.floor(h * 0.26))}px "Fredoka One", sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('🌾 HAY BALE (JUMP ⬆️)', 0, -h * 0.88);
            }
            break;
        }

        case 'barrier': {
            // Farm Low Clearance Gantry: MUST SLIDE UNDER!
            const w = laneW * 0.90;
            const h = w * 0.88; // Tall clearance archway!

            const postW = w * 0.12;
            // Two tall wooden side posts
            ctx.fillStyle = '#78350F';
            ctx.fillRect(-w / 2, -h, postW, h + 10);
            ctx.fillRect(w / 2 - postW, -h, postW, h + 10);

            // Overhead clearance crossbeam
            const beamH = h * 0.28;
            ctx.fillStyle = '#991B1B';
            ctx.fillRect(-w / 2, -h, w, beamH);

            // Red & White warning caution stripes
            ctx.fillStyle = '#FFFFFF';
            const stripes = 6;
            for (let i = 0; i < stripes; i++) {
                ctx.fillRect(-w / 2 + (w / stripes) * i + 4, -h + 2, (w / stripes) * 0.45, beamH - 4);
            }

            // Big "SLIDE ⬇️" clearance text
            if (scale > 0.35) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `bold ${Math.max(12, Math.floor(beamH * 0.55))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('SLIDE ⬇️', 0, -h + beamH * 0.68);
            }
            break;
        }

        case 'tractor': {
            // Big Bold Red Farm Tractor
            const w = laneW * 0.84;
            const h = w * 0.78; // Tall, hefty tractor!

            // Massive Black Rear Mud Tires with deep treads
            const tireR = w * 0.20;
            ctx.fillStyle = '#18181B';
            ctx.beginPath(); ctx.arc(-w * 0.36, -tireR * 0.2, tireR, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(w * 0.36, -tireR * 0.2, tireR, 0, Math.PI * 2); ctx.fill();
            // Yellow hubcaps
            ctx.fillStyle = '#FDE047';
            ctx.beginPath(); ctx.arc(-w * 0.36, -tireR * 0.2, tireR * 0.4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(w * 0.36, -tireR * 0.2, tireR * 0.4, 0, Math.PI * 2); ctx.fill();

            // Main Red Tractor Body
            ctx.fillStyle = COLORS.barnRed;
            ctx.fillRect(-w * 0.42, -h * 0.55, w * 0.84, h * 0.55);

            // Cab & Windshield
            ctx.fillStyle = '#991B1B';
            ctx.fillRect(-w * 0.28, -h * 0.95, w * 0.56, h * 0.45);
            ctx.fillStyle = '#7DD3FC'; // Bright blue glass
            ctx.fillRect(-w * 0.24, -h * 0.90, w * 0.48, h * 0.30);

            // Front Yellow Headlights
            ctx.fillStyle = '#FEF08A';
            const headR = w * 0.07;
            ctx.beginPath(); ctx.arc(-w * 0.28, -h * 0.22, headR, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(w * 0.28, -h * 0.22, headR, 0, Math.PI * 2); ctx.fill();

            // Vertical Exhaust Pipe puffing smoke
            ctx.fillStyle = '#475569';
            const pipeW = Math.max(3, w * 0.05);
            ctx.fillRect(w * 0.18, -h * 1.25, pipeW, h * 0.38);
            // Smoke puff
            ctx.fillStyle = 'rgba(203, 213, 225, 0.65)';
            ctx.beginPath(); ctx.arc(w * 0.2 + Math.sin(frameCount*0.2)*4, -h * 1.35, w * 0.08, 0, Math.PI*2); ctx.fill();
            break;
        }

        case 'truck': {
            // Big Blue Highway Delivery Truck
            const w = laneW * 0.85;
            const h = w * 0.82;

            ctx.fillStyle = '#1D4ED8';
            ctx.fillRect(-w / 2, -h * 0.8, w, h * 0.85);
            ctx.fillStyle = '#60A5FA';
            ctx.fillRect(-w * 0.4, -h * 0.72, w * 0.8, h * 0.35);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(-w * 0.4, -h * 0.1, w * 0.18, h * 0.12);
            ctx.fillRect(w * 0.4 - w * 0.18, -h * 0.1, w * 0.18, h * 0.12);
            break;
        }

        case 'mud': {
            // Mud Puddle (Stumble Trap)
            const w = laneW * 0.82;
            const h = w * 0.32; // Natural ground perspective ellipse
            ctx.fillStyle = 'rgba(107, 66, 38, 0.85)';
            ctx.beginPath();
            ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Mud bubbles & splashes
            ctx.fillStyle = 'rgba(67, 40, 20, 0.7)';
            ctx.beginPath(); ctx.arc(-w * 0.2, -h * 0.1, w * 0.08, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(w * 0.25, h * 0.1, w * 0.06, 0, Math.PI * 2); ctx.fill();
            break;
        }
    }

    ctx.restore();
}

// 6. COINS (Milk Cents - Balanced Arcade Size, 3D Rotating Golden Medallion)
function drawCoin(c) {
    const scale = getScaleAtY(c.y);
    const airborneOffset = c.airborne ? (c.arcHeight || 36) * scale : 0;
    const y = c.y - airborneOffset;

    // Use visual Y so the coin is ALWAYS perfectly centered in the lane at its visual position!
    const x = getLaneXAtY(c.lane, y);
    const laneW = getLaneWidthAtY(y);

    // Balanced arcade coin radius: ~13px far horizon, ~24px at player lane (fits neatly inside lane)
    const radius = Math.max(13, Math.min(24, laneW * 0.115));

    // 3D vertical spin effect (Subway Surfers / Crossy Road style)
    const spin = c.sparkle * 2.2;
    const cosSpin = Math.cos(spin);
    const isFront = cosSpin >= 0;
    const spinWidthFactor = Math.max(0.4, Math.abs(cosSpin)); // keep at least 40% width for legibility
    const coinW = radius * spinWidthFactor;
    const coinH = radius;

    ctx.save();
    ctx.translate(x, y);

    // 1. Soft 3D Ground Shadow on Road
    if (c.airborne) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.ellipse(0, airborneOffset + coinH * 0.4, radius * 0.75, radius * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.beginPath();
        ctx.ellipse(0, coinH * 0.55, radius * 0.7, radius * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 2. Radiant Outer Golden Glow Ring (Tight 3px highlight, never bleeds outside lane)
    const haloGlow = 0.35 + Math.sin(c.sparkle * 3) * 0.15;
    ctx.fillStyle = `rgba(253, 224, 71, ${haloGlow})`;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
    ctx.fill();

    // 3. 3D Metal Edge / Rim Extrusion (Gives solid thickness when rotating)
    const edgeOffset = (isFront ? 1 : -1) * Math.max(1.5, radius * 0.08);
    ctx.fillStyle = '#92400E'; // deep bronze amber edge
    ctx.beginPath();
    ctx.ellipse(edgeOffset, 0, coinW, coinH, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Main Coin Face (Polished Golden Gradient)
    const coinGrad = ctx.createLinearGradient(-coinW, -coinH, coinW, coinH);
    coinGrad.addColorStop(0, '#FEF08A'); // bright sunlit rim
    coinGrad.addColorStop(0.35, '#FACC15'); // vibrant arcade gold
    coinGrad.addColorStop(0.75, '#EAB308'); // warm gold
    coinGrad.addColorStop(1, '#CA8A04');   // deep shadow gold

    ctx.fillStyle = coinGrad;
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = Math.max(1.8, radius * 0.075);
    ctx.beginPath();
    ctx.ellipse(0, 0, coinW, coinH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 5. Engraved Inner Bevel Ring
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = Math.max(1.2, radius * 0.045);
    ctx.beginPath();
    ctx.ellipse(0, 0, coinW * 0.76, coinH * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 6. Milk Cent Embossed Logo ('¢' symbol)
    if (radius >= 13) {
        const fontSize = Math.floor(radius * 1.05);
        ctx.font = `900 ${fontSize}px "Fredoka One", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Drop shadow for stamped relief look
        ctx.fillStyle = '#78350F';
        ctx.fillText('¢', 0.5, 0.8);

        // Highlight text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('¢', 0, 0);
    }

    // 7. Twinkling Specular Glint (Twinkles on the rim)
    const sparkleCycle = (c.sparkle * 1.5) % (Math.PI * 2);
    if (sparkleCycle < 1.0) {
        const glintAlpha = Math.sin((sparkleCycle / 1.0) * Math.PI);
        const glintX = -coinW * 0.55;
        const glintY = -coinH * 0.55;
        const glintSize = radius * 0.32;

        ctx.fillStyle = `rgba(255, 255, 255, ${glintAlpha})`;
        ctx.beginPath();
        ctx.moveTo(glintX, glintY - glintSize);
        ctx.lineTo(glintX + glintSize * 0.25, glintY);
        ctx.lineTo(glintX + glintSize, glintY);
        ctx.lineTo(glintX + glintSize * 0.25, glintY + glintSize * 0.25);
        ctx.lineTo(glintX, glintY + glintSize);
        ctx.lineTo(glintX - glintSize * 0.25, glintY + glintSize * 0.25);
        ctx.lineTo(glintX - glintSize, glintY);
        ctx.lineTo(glintX - glintSize * 0.25, glintY);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

// 7. POWER-UPS (Turbo Milk, Coin Magnet, Milk Shield)
function drawPowerup(p) {
    const scale = getScaleAtY(p.y);
    const laneW = getLaneWidthAtY(p.y);
    const x = getLaneXAtY(p.lane, p.y);
    const y = p.y;
    const r = Math.max(18, Math.min(42, laneW * 0.16));

    ctx.save();
    ctx.translate(x, y);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.75, r * 0.85, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    const glowColor = p.type === 'turbo' ? '#38BDF8' : p.type === 'magnet' ? '#FACC15' : '#4ADE80';

    // Outer Pulsing Glow Aura
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = Math.max(3, r * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, r + Math.sin(p.glow * 3) * 5, 0, Math.PI * 2);
    ctx.stroke();

    // Background circle (Glossy pearl white disc)
    const discGrad = ctx.createLinearGradient(0, -r, 0, r);
    discGrad.addColorStop(0, '#FFFFFF');
    discGrad.addColorStop(1, '#E2E8F0');
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Outer colored badge border
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = Math.max(2.5, r * 0.08);
    ctx.stroke();

    // Large Emoji Icon
    ctx.font = `${Math.floor(r * 1.15)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.type === 'turbo' ? '🥛' : p.type === 'magnet' ? '🧲' : '🛡️', 0, 1);

    ctx.restore();
}

// ==========================================
// SCREEN FLOW & UI
// ==========================================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function startGame() {
    initAudio();
    initGame();
    state = 'playing';
    showScreen('hud');
    startBGM();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    showScreen('pauseScreen');
    stopBGM();
}

function resumeGame() {
    state = 'playing';
    showScreen('hud');
    startBGM();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameOver(cause) {
    state = 'gameover';
    stopBGM();
    sfxMoo();

    const finalDist = Math.floor(distance);
    const finalCoins = coinsCollected;
    const finalScore = score;

    totalCoins += finalCoins;
    const isNewRecord = finalDist > highScore;
    if (isNewRecord) highScore = finalDist;
    saveData();

    document.getElementById('gameOverCause').textContent = cause;
    document.getElementById('finalDistance').textContent = finalDist + 'm';
    document.getElementById('finalCoins').textContent = finalCoins;
    document.getElementById('finalScore').textContent = finalScore.toLocaleString();
    document.getElementById('newHighScore').style.display = isNewRecord ? 'block' : 'none';

    // Milestone Badges (GDD 3.5)
    const badgesEl = document.getElementById('gameOverBadges');
    badgesEl.innerHTML = '';
    if (finalDist >= 500)  addBadge(badgesEl, '🥉 500m Barnyard Escapist');
    if (finalDist >= 1000) addBadge(badgesEl, '🥈 1000m Harvest Champion');
    if (finalDist >= 2000) addBadge(badgesEl, '🥇 2000m Highway Legend');
    if (finalCoins >= 50)  addBadge(badgesEl, '💰 Coin Hoarder');
    if (finalCoins >= 100) addBadge(badgesEl, '👑 Rich Cow');

    setTimeout(() => showScreen('gameOverScreen'), 600);
}

function addBadge(container, text) {
    const b = document.createElement('div');
    b.className = 'badge';
    b.textContent = text;
    container.appendChild(b);
}

function goToMenu() {
    state = 'menu';
    stopBGM();
    showScreen('mainMenu');
    updateMenuUI();
}

function updateMenuUI() {
    document.getElementById('menuHighScore').textContent = highScore;
    document.getElementById('menuCoins').textContent = totalCoins;
}

// Shop System (GDD 3.6.5)
const shopItems = [
    { id: 'golden', name: 'Golden Cow', icon: '✨🐄', price: 200, type: 'skin' },
    { id: 'superhero', name: 'Super Cow', icon: '🦸🐄', price: 400, type: 'skin' },
    { id: 'wizard', name: 'Wizard Cow', icon: '🧙🐄', price: 600, type: 'skin' },
    { id: 'multiplier2x', name: '2x Score Multiplier', icon: '⭐×2', price: 500, type: 'upgrade' },
    { id: 'multiplier3x', name: '3x Score Multiplier', icon: '⭐×3', price: 1200, type: 'upgrade' },
];

function openShop() {
    sfxClick();
    showScreen('shopScreen');
    document.getElementById('shopCoins').textContent = totalCoins;
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';

    // Classic Skin
    const defaultDiv = document.createElement('div');
    defaultDiv.className = 'shop-item' + (activeSkin === 'default' ? ' owned' : '');
    defaultDiv.innerHTML = `
        <span class="shop-item-icon">🐄</span>
        <span class="shop-item-name">Classic Moo</span>
        <span class="shop-item-price">${activeSkin === 'default' ? '✅ Equipped' : 'Equip'}</span>
    `;
    defaultDiv.addEventListener('click', () => {
        activeSkin = 'default';
        saveData();
        sfxClick();
        openShop();
    });
    grid.appendChild(defaultDiv);

    for (let item of shopItems) {
        const owned = ownedSkins.includes(item.id) ||
            (item.id === 'multiplier2x' && scoreMultiplier >= 2) ||
            (item.id === 'multiplier3x' && scoreMultiplier >= 3);

        const div = document.createElement('div');
        div.className = 'shop-item' + (owned ? ' owned' : '');
        div.innerHTML = `
            <span class="shop-item-icon">${item.icon}</span>
            <span class="shop-item-name">${item.name}</span>
            <span class="shop-item-price">${owned ? (item.type === 'skin' ? (activeSkin === item.id ? '✅ Equipped' : 'Equip') : '✅ Owned') : '🪙 ' + item.price}</span>
        `;
        div.addEventListener('click', () => {
            if (owned && item.type === 'skin') {
                activeSkin = item.id;
                saveData();
                openShop();
                sfxClick();
            } else if (!owned && totalCoins >= item.price) {
                totalCoins -= item.price;
                if (item.type === 'skin') {
                    ownedSkins.push(item.id);
                    activeSkin = item.id;
                } else if (item.id === 'multiplier2x') scoreMultiplier = 2;
                else if (item.id === 'multiplier3x') scoreMultiplier = 3;
                saveData();
                sfxPowerup();
                openShop();
            } else if (!owned) {
                sfxCrash();
            }
        });
        grid.appendChild(div);
    }
}

// UI Event Listeners
document.getElementById('mooBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    initAudio();
    doMoo();
});
document.getElementById('playBtn').addEventListener('click', () => { sfxClick(); startGame(); });
document.getElementById('shopBtn').addEventListener('click', openShop);
document.getElementById('dailyBtn').addEventListener('click', () => {
    sfxClick();
    startGame();
    gameSpeed = 12;
    distance = 500; // Starts directly in Level 2: Harvest Fields!
    kiki.tipText = "Daily Challenge: Harvest sprint at 500m! 🏃💨";
    kiki.tipTimer = 180;
});
document.getElementById('shopBackBtn').addEventListener('click', () => { sfxClick(); goToMenu(); });
document.getElementById('pauseBtn').addEventListener('click', pauseGame);
document.getElementById('resumeBtn').addEventListener('click', () => { sfxClick(); resumeGame(); });
document.getElementById('restartBtn').addEventListener('click', () => { sfxClick(); startGame(); });
document.getElementById('pauseMenuBtn').addEventListener('click', () => { sfxClick(); goToMenu(); });
document.getElementById('retryBtn').addEventListener('click', () => { sfxClick(); startGame(); });
document.getElementById('gameOverMenuBtn').addEventListener('click', () => { sfxClick(); goToMenu(); });
document.getElementById('soundToggle').addEventListener('change', (e) => {
    soundEnabled = e.target.checked;
    if (soundEnabled && state === 'playing') startBGM(); else stopBGM();
});

// Main Loop
function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    if (state === 'playing') {
        update(dt);
        draw();
        requestAnimationFrame(gameLoop);
    } else if (state === 'paused') {
        draw();
    }
}

// Initialize Menu
updateMenuUI();
document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('click', initAudio, { once: true });

})();
