// ============================================
// MOO MOO - Endless Runner Game
// Based on Game Design Document by MOO&co
// HTML5 Canvas + JavaScript
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

// ---- Constants (from GDD) ----
const LANE_COUNT = 3;
const BASE_SPEED = 5;
const MAX_SPEED = 18;

// Biome distance thresholds (meters)
const BIOME_BARNYARD = 0;
const BIOME_HARVEST = 500;
const BIOME_HIGHWAY = 1500;

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
    road: '#8B7355',
    roadLine: '#F9C846',
    mud: '#6B4226',
    asphalt: '#555555',
};

// ===== PERSPECTIVE SYSTEM =====
// The road converges to a vanish point at the top.
// All objects use a normalized Y (0 = horizon, 1 = bottom of screen)
// and are positioned/scaled according to perspective.

const VANISH_Y_RATIO = 0.38;    // vanish point Y as fraction of screen height
const PLAYER_Y_RATIO = 0.75;    // player's Y position as fraction of screen height
const ROAD_BOTTOM_WIDTH = 0.68; // road width at bottom as fraction of screen width
const ROAD_TOP_WIDTH = 0.06;    // road width at vanish point

// Get the perspective factor for a given screen Y position
// Returns 0 at vanish point, 1 at screen bottom
function getPerspectiveT(screenY) {
    const h = H();
    const vanishY = h * VANISH_Y_RATIO;
    return Math.max(0, Math.min(1, (screenY - vanishY) / (h - vanishY)));
}

// Get the road center X (always screen center)
function getRoadCenterX() { return W() / 2; }

// Get the road half-width at a given screen Y
function getRoadHalfWidth(screenY) {
    const t = getPerspectiveT(screenY);
    const w = W();
    const bottomHalf = w * ROAD_BOTTOM_WIDTH / 2;
    const topHalf = w * ROAD_TOP_WIDTH / 2;
    return topHalf + (bottomHalf - topHalf) * t;
}

// Get the X position of a lane center at a given screen Y
// lane: 0 (left), 1 (center), 2 (right)
function getLaneXAtY(lane, screenY) {
    const cx = getRoadCenterX();
    const halfW = getRoadHalfWidth(screenY);
    const laneWidth = (halfW * 2) / 3;
    return cx - halfW + laneWidth * lane + laneWidth / 2;
}

// Get scale factor at a given screen Y (for sizing objects)
function getScaleAtY(screenY) {
    return Math.max(0.15, getPerspectiveT(screenY));
}

// Legacy helper — lane X at the player's Y
function getLaneX(lane) {
    return getLaneXAtY(lane, H() * PLAYER_Y_RATIO);
}

// ---- Audio System ----
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let soundEnabled = true;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
}

function playTone(freq, duration, type = 'square', vol = 0.15) {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

function sfxCoin()    { playTone(880, 0.1, 'sine', 0.12); setTimeout(() => playTone(1100, 0.1, 'sine', 0.1), 50); }
function sfxJump()    { playTone(300, 0.15, 'triangle', 0.1); playTone(500, 0.1, 'triangle', 0.08); }
function sfxSlide()   { playTone(200, 0.12, 'sawtooth', 0.06); }
function sfxCrash()   { playTone(100, 0.3, 'sawtooth', 0.2); playTone(80, 0.4, 'square', 0.15); }
function sfxPowerup() { playTone(523, 0.1, 'sine', 0.15); setTimeout(() => playTone(659, 0.1, 'sine', 0.12), 80); setTimeout(() => playTone(784, 0.15, 'sine', 0.1), 160); }
function sfxMoo()     { playTone(120, 0.5, 'sawtooth', 0.12); setTimeout(() => playTone(140, 0.4, 'sawtooth', 0.1), 200); }
function sfxBark()    { playTone(400, 0.08, 'square', 0.1); setTimeout(() => playTone(500, 0.06, 'square', 0.08), 100); }
function sfxClick()   { playTone(600, 0.05, 'sine', 0.1); }

// Background music
let bgmInterval = null;
function startBGM() {
    if (!soundEnabled || !audioCtx) return;
    stopBGM();
    const notes = [262, 330, 392, 330, 294, 349, 330, 262, 294, 330, 262, 196];
    let i = 0;
    bgmInterval = setInterval(() => {
        playTone(notes[i % notes.length], 0.2, 'triangle', 0.04);
        i++;
    }, 250);
}
function stopBGM() {
    if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

// ---- Game State ----
let state = 'menu';
let distance = 0;
let score = 0;
let coinsCollected = 0;
let gameSpeed = BASE_SPEED;
let frameCount = 0;
let lastTime = 0;

// Persistent data
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

// ---- Player (Moo Moo) ----
const player = {
    lane: 1,
    targetLane: 1,
    x: 0, y: 0,
    width: 50, height: 60,
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
};

// ---- Enemies ----
const farmerJoe = {
    active: false,
    closeness: 0,
    throwTimer: 0,
    netActive: false,
    netLane: 1,
    netY: 0,
};

const rover = {
    active: false,
    lane: -1,
    y: 0,
    warning: false,
    warningTimer: 0,
    leaping: false,
};

const helicopter = {
    active: false,
    x: 0,
    targetLane: 1,
    dropTimer: 0,
    drops: [],
    spotlightOpacity: 0,
};

// ---- Game Objects ----
let obstacles = [];
let coins = [];
let powerups = [];
let particles = [];

// Kiki the Pigeon tips
const kikiTips = [
    "Swipe left/right to dodge! 🐦",
    "Turbo Milk makes you invincible! 🥛",
    "Watch out for Rover! He jumps into your lane! 🐕",
    "Mud puddles slow you down! 💧",
    "Collect coins for the shop! 🪙",
    "The Milk Shield absorbs one hit! 🛡️",
    "Speed increases every 200 meters! ⚡",
    "The helicopter drops nets ahead! 🚁",
    "Jump over fences, slide under barriers! 🏃",
];
let lastTipTime = 0;

// ---- Biome ----
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
                sky: ['#4EC0E9', '#87CEEB'],
                ground: '#7CBC37',
                road: '#A0875A',
                roadLine: '#F9C846',
                ambient: 'rgba(255,255,200,0.05)',
            };
        case 'harvest':
            return {
                sky: ['#F5A623', '#F9C846'],
                ground: '#D4A017',
                road: '#8B6914',
                roadLine: '#E8A923',
                ambient: 'rgba(255,180,50,0.08)',
            };
        case 'highway':
            return {
                sky: ['#4EC0E9', '#B0D4E8'],
                ground: '#666',
                road: '#444',
                roadLine: '#FFF',
                ambient: 'rgba(200,200,255,0.05)',
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

    farmerJoe.active = true;
    farmerJoe.closeness = 0;
    farmerJoe.throwTimer = 0;
    farmerJoe.netActive = false;

    rover.active = false;
    rover.warning = false;
    rover.leaping = false;

    helicopter.active = false;
    helicopter.drops = [];

    obstacles = [];
    coins = [];
    powerups = [];
    particles = [];

    lastTipTime = 0;
}

// ---- Obstacle Generation ----
let spawnTimer = 0;

function spawnObstacle() {
    const biome = getCurrentBiome();
    const lane = Math.floor(Math.random() * 3);
    let type, w, h, jumpable, slideable;

    if (biome === 'barnyard') {
        const r = Math.random();
        if (r < 0.4) {
            type = 'fence'; w = 55; h = 35; jumpable = true; slideable = false;
        } else if (r < 0.7) {
            type = 'haybale'; w = 50; h = 40; jumpable = true; slideable = false;
        } else {
            type = 'barrier'; w = 55; h = 50; jumpable = false; slideable = true;
        }
    } else if (biome === 'harvest') {
        const r = Math.random();
        if (r < 0.3) {
            type = 'tractor'; w = 60; h = 55; jumpable = false; slideable = false;
        } else if (r < 0.5) {
            type = 'mud'; w = 55; h = 20; jumpable = true; slideable = false;
        } else if (r < 0.75) {
            type = 'fence'; w = 55; h = 35; jumpable = true; slideable = false;
        } else {
            type = 'barrier'; w = 55; h = 50; jumpable = false; slideable = true;
        }
    } else { // highway
        const r = Math.random();
        if (r < 0.35) {
            type = 'truck'; w = 60; h = 60; jumpable = false; slideable = false;
        } else if (r < 0.55) {
            type = 'barrier'; w = 55; h = 50; jumpable = false; slideable = true;
        } else if (r < 0.8) {
            type = 'fence'; w = 55; h = 35; jumpable = true; slideable = false;
        } else {
            type = 'tractor'; w = 60; h = 55; jumpable = false; slideable = false;
        }
    }

    const vanishY = H() * VANISH_Y_RATIO;
    obstacles.push({
        type, lane, baseWidth: w, baseHeight: h,
        y: vanishY - 20, // spawn just above horizon
        jumpable, slideable,
        hit: false,
    });

    // Occasionally spawn double obstacles
    if (distance > 300 && Math.random() < 0.25) {
        let lane2 = (lane + (Math.random() < 0.5 ? 1 : 2)) % 3;
        obstacles.push({
            type, lane: lane2, baseWidth: w, baseHeight: h,
            y: vanishY - 20,
            jumpable, slideable,
            hit: false,
        });
    }
}

function spawnCoin() {
    if (Math.random() > 0.03) return;
    const lane = Math.floor(Math.random() * 3);
    const vanishY = H() * VANISH_Y_RATIO;
    const count = Math.random() < 0.3 ? 3 : 1;
    for (let i = 0; i < count; i++) {
        coins.push({
            lane,
            y: vanishY - 10 - i * 15,
            collected: false,
            baseSize: 16,
            sparkle: Math.random() * 6,
        });
    }
}

function spawnPowerup() {
    if (Math.random() > 0.003) return;
    const lane = Math.floor(Math.random() * 3);
    const types = ['turbo', 'magnet', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    const vanishY = H() * VANISH_Y_RATIO;
    powerups.push({
        type, lane,
        y: vanishY - 10,
        collected: false,
        baseSize: 22,
        glow: 0,
    });
}

// ---- Particle System ----
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

// ---- Player Actions ----
function moveLeft() {
    if (player.targetLane > 0) { player.targetLane--; sfxClick(); }
}
function moveRight() {
    if (player.targetLane < 2) { player.targetLane++; sfxClick(); }
}
function jump() {
    if (!player.jumping && !player.sliding) {
        player.jumping = true;
        player.jumpVel = -14;
        sfxJump();
    }
}
function slide() {
    if (!player.jumping && !player.sliding) {
        player.sliding = true;
        player.slideTimer = 30;
        sfxSlide();
    }
}

// ---- Input Handling ----
document.addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    switch(e.key) {
        case 'ArrowLeft': case 'a': case 'A': moveLeft(); break;
        case 'ArrowRight': case 'd': case 'D': moveRight(); break;
        case 'ArrowUp': case 'w': case 'W': case ' ': e.preventDefault(); jump(); break;
        case 'ArrowDown': case 's': case 'S': slide(); break;
        case 'Escape': case 'p': case 'P': pauseGame(); break;
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
    if (absDx > 30 && absDx > absDy) {
        if (dx > 0) moveRight(); else moveLeft();
    } else if (absDy > 30 && absDy > absDx) {
        if (dy < 0) jump(); else slide();
    }
}, { passive: true });

// ---- Collision Detection (perspective-aware) ----
function checkCollision(obj) {
    const scale = getScaleAtY(obj.y);
    const objW = obj.baseWidth * scale;
    const objH = obj.baseHeight * scale;
    const objX = getLaneXAtY(obj.lane, obj.y);

    const px = player.x;
    const py = player.y + player.jumpY;
    const pw = player.width * 0.5;
    const ph = player.sliding ? player.height * 0.3 : player.height * 0.7;
    const pyTop = player.sliding ? py : py - ph;

    return (
        Math.abs(px - objX) < (pw + objW) / 2 &&
        pyTop < obj.y + objH / 2 &&
        py > obj.y - objH / 2
    );
}

// ---- Update Game ----
function update(dt) {
    if (state !== 'playing') return;
    frameCount++;

    // Speed increases by 5% every 200 meters (GDD)
    const speedMultiplier = 1 + Math.floor(distance / 200) * 0.05;
    gameSpeed = Math.min(BASE_SPEED * speedMultiplier, MAX_SPEED);
    if (player.turboActive) gameSpeed = MAX_SPEED;

    // Distance
    const metersDelta = gameSpeed * 0.15;
    distance += metersDelta;
    score = Math.floor(distance * 10 * scoreMultiplier);

    // -- Player update --
    player.y = H() * PLAYER_Y_RATIO;
    const targetX = getLaneX(player.targetLane);
    player.x += (targetX - player.x) * 0.2;
    player.lane = player.targetLane;

    // Jump
    if (player.jumping) {
        player.jumpVel += 0.8;
        player.jumpY += player.jumpVel;
        if (player.jumpY >= 0) {
            player.jumpY = 0;
            player.jumping = false;
            player.jumpVel = 0;
        }
    }

    // Slide
    if (player.sliding) {
        player.slideTimer--;
        if (player.slideTimer <= 0) player.sliding = false;
    }

    if (player.stumbleTimer > 0) player.stumbleTimer--;

    // Animation
    player.animTimer++;
    if (player.animTimer > 6) { player.animFrame = (player.animFrame + 1) % 4; player.animTimer = 0; }

    // Power-ups timer
    if (player.turboActive) {
        player.turboTimer -= dt;
        if (player.turboTimer <= 0) { player.turboActive = false; player.turboTimer = 0; }
    }
    if (player.magnetActive) {
        player.magnetTimer -= dt;
        if (player.magnetTimer <= 0) { player.magnetActive = false; player.magnetTimer = 0; }
    }

    // -- Spawning --
    spawnTimer += gameSpeed;
    const minGap = Math.max(60, 150 - distance * 0.03);
    if (spawnTimer > minGap) {
        spawnObstacle();
        spawnTimer = 0;
    }
    spawnCoin();
    spawnPowerup();

    // -- Move all objects down the road (perspective motion) --
    // Objects accelerate as they get closer (perspective)
    const h = H();
    const vanishY = h * VANISH_Y_RATIO;

    for (let o of obstacles) {
        const t = getPerspectiveT(o.y);
        // speed increases as objects get closer (quadratic feel)
        o.y += gameSpeed * (0.3 + t * 1.5);
    }
    obstacles = obstacles.filter(o => o.y < h + 100 && !o.hit);

    for (let c of coins) {
        const t = getPerspectiveT(c.y);
        c.y += gameSpeed * (0.3 + t * 1.5);
        c.sparkle += 0.1;

        // Magnet
        if (player.magnetActive && !c.collected) {
            const cx = getLaneXAtY(c.lane, c.y);
            const dx = player.x - cx;
            const dy = (player.y + player.jumpY) - c.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 180) {
                c.y += dy * 0.12;
            }
        }
    }
    coins = coins.filter(c => c.y < h + 50 && !c.collected);

    for (let p of powerups) {
        const t = getPerspectiveT(p.y);
        p.y += gameSpeed * (0.3 + t * 1.5);
        p.glow += 0.08;
    }
    powerups = powerups.filter(p => p.y < h + 50 && !p.collected);

    // Particles
    for (let p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= p.decay;
    }
    particles = particles.filter(p => p.life > 0);

    // -- Collision: Obstacles --
    for (let o of obstacles) {
        if (o.hit) continue;
        if (o.jumpable && player.jumping && player.jumpY < -20) continue;
        if (o.slideable && player.sliding) continue;

        if (checkCollision(o)) {
            o.hit = true;
            if (player.turboActive) {
                const ox = getLaneXAtY(o.lane, o.y);
                spawnParticles(ox, o.y, '#FFF', 8, 5);
                continue;
            }
            if (o.type === 'mud') {
                player.stumbleTimer = 30;
                const ox = getLaneXAtY(o.lane, o.y);
                spawnParticles(ox, o.y, COLORS.mud, 6, 3);
                sfxSlide();
                continue;
            }
            if (player.hasShield) {
                player.hasShield = false;
                player.stumbleTimer = 20;
                const ox = getLaneXAtY(o.lane, o.y);
                spawnParticles(ox, o.y, COLORS.skyBlue, 10, 4);
                document.getElementById('hudShield').style.display = 'none';
                sfxCrash();
                continue;
            }
            sfxCrash();
            const ox = getLaneXAtY(o.lane, o.y);
            spawnParticles(ox, o.y, COLORS.barnRed, 15, 5);
            gameOver(`Crashed into a ${o.type}!`);
            return;
        }
    }

    // -- Collision: Coins --
    for (let c of coins) {
        if (c.collected) continue;
        const cx = getLaneXAtY(c.lane, c.y);
        const dx = player.x - cx;
        const dy = (player.y + player.jumpY) - c.y;
        if (Math.sqrt(dx*dx + dy*dy) < 35) {
            c.collected = true;
            coinsCollected++;
            spawnParticles(cx, c.y, COLORS.strawYellow, 4, 2);
            sfxCoin();
        }
    }

    // -- Collision: Powerups --
    for (let p of powerups) {
        if (p.collected) continue;
        const px2 = getLaneXAtY(p.lane, p.y);
        const dx = player.x - px2;
        const dy = (player.y + player.jumpY) - p.y;
        if (Math.sqrt(dx*dx + dy*dy) < 40) {
            p.collected = true;
            sfxPowerup();
            if (p.type === 'turbo') {
                player.turboActive = true;
                player.turboTimer = TURBO_DURATION;
                showKikiTip("Turbo Milk activated! 🥛💨");
            } else if (p.type === 'magnet') {
                player.magnetActive = true;
                player.magnetTimer = MAGNET_DURATION;
                showKikiTip("Coin Magnet active! 🧲");
            } else if (p.type === 'shield') {
                player.hasShield = true;
                document.getElementById('hudShield').style.display = 'block';
                showKikiTip("Milk Shield ready! 🛡️");
            }
        }
    }

    // -- Farmer Joe --
    if (farmerJoe.active) {
        if (player.stumbleTimer > 0) farmerJoe.closeness += 0.3;
        else if (player.turboActive) farmerJoe.closeness = Math.max(0, farmerJoe.closeness - 2);
        else farmerJoe.closeness = Math.max(0, farmerJoe.closeness - 0.05);

        farmerJoe.throwTimer += dt;
        if (farmerJoe.throwTimer > 8 && distance > 100 && farmerJoe.closeness > 30) {
            farmerJoe.throwTimer = 0;
            farmerJoe.netActive = true;
            farmerJoe.netLane = player.lane;
            farmerJoe.netY = h + 50;
        }
        if (farmerJoe.netActive) {
            farmerJoe.netY -= gameSpeed * 1.2;
            if (farmerJoe.netY < vanishY) farmerJoe.netActive = false;
            const netX = getLaneXAtY(farmerJoe.netLane, player.y);
            if (Math.abs(player.x - netX) < 30 && Math.abs((player.y + player.jumpY) - farmerJoe.netY) < 30) {
                if (!player.turboActive) {
                    if (player.hasShield) {
                        player.hasShield = false;
                        document.getElementById('hudShield').style.display = 'none';
                        farmerJoe.netActive = false;
                    } else if (!player.jumping) {
                        sfxCrash();
                        gameOver("Caught by Farmer Joe's net! 🥅");
                        return;
                    }
                }
            }
        }
        if (farmerJoe.closeness >= 95) {
            sfxCrash();
            gameOver("Farmer Joe caught you! 👨‍🌾");
            return;
        }
    }

    // -- Rover the Dog (after 500m) --
    if (distance > BIOME_HARVEST && !rover.active && Math.random() < 0.001) {
        rover.active = true;
        rover.lane = Math.floor(Math.random() * 3);
        rover.y = vanishY;
        rover.warning = true;
        rover.warningTimer = 90;
        rover.leaping = false;
        sfxBark();
        showKikiTip("Watch out! Rover incoming! 🐕");
    }
    if (rover.active) {
        if (rover.warning) {
            rover.warningTimer--;
            if (rover.warningTimer <= 0) {
                rover.warning = false;
                rover.leaping = true;
                rover.lane = player.lane;
                rover.y = vanishY;
            }
        }
        if (rover.leaping) {
            const t = getPerspectiveT(rover.y);
            rover.y += gameSpeed * (0.5 + t * 2);
            const rx = getLaneXAtY(rover.lane, rover.y);
            if (Math.abs(player.x - rx) < 30 && Math.abs((player.y + player.jumpY) - rover.y) < 35) {
                if (!player.turboActive) {
                    if (player.hasShield) {
                        player.hasShield = false;
                        document.getElementById('hudShield').style.display = 'none';
                        rover.active = false;
                    } else if (!player.jumping) {
                        sfxCrash();
                        gameOver("Rover the Dog tackled you! 🐕");
                        return;
                    }
                }
            }
            if (rover.y > h + 100) rover.active = false;
        }
    }

    // -- Helicopter (after 1500m) --
    if (distance > BIOME_HIGHWAY && !helicopter.active && Math.random() < 0.0005) {
        helicopter.active = true;
        helicopter.x = W() / 2;
        helicopter.targetLane = player.lane;
        helicopter.dropTimer = 120;
        helicopter.drops = [];
        showKikiTip("Helicopter spotted! Watch for nets! 🚁");
    }
    if (helicopter.active) {
        helicopter.x += (getLaneXAtY(helicopter.targetLane, h * 0.3) - helicopter.x) * 0.03;
        helicopter.spotlightOpacity = 0.1 + Math.sin(frameCount * 0.05) * 0.05;
        helicopter.dropTimer--;
        if (helicopter.dropTimer <= 0) {
            const numDrops = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < numDrops; i++) {
                helicopter.drops.push({
                    lane: Math.floor(Math.random() * 3),
                    y: vanishY + 20 + i * 30,
                });
            }
            helicopter.dropTimer = 240;
            helicopter.targetLane = Math.floor(Math.random() * 3);
        }
        for (let d of helicopter.drops) {
            const t = getPerspectiveT(d.y);
            d.y += gameSpeed * (0.3 + t * 1.5);
            const dx = getLaneXAtY(d.lane, d.y);
            if (Math.abs(player.x - dx) < 30 && Math.abs((player.y + player.jumpY) - d.y) < 30) {
                if (!player.turboActive) {
                    if (player.hasShield) {
                        player.hasShield = false;
                        document.getElementById('hudShield').style.display = 'none';
                        d.y = h + 100;
                    } else {
                        sfxCrash();
                        gameOver("Hit by helicopter net! 🚁🥅");
                        return;
                    }
                }
            }
        }
        helicopter.drops = helicopter.drops.filter(d => d.y < h + 100);
        if (helicopter.drops.length === 0 && helicopter.dropTimer > 100) {
            helicopter.active = false;
        }
    }

    // -- Kiki tips --
    if (distance - lastTipTime > 300 && Math.random() < 0.002) {
        const tip = kikiTips[Math.floor(Math.random() * kikiTips.length)];
        showKikiTip(tip);
        lastTipTime = distance;
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

// ============ DRAW ============

function draw() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);

    const colors = getBiomeColors();
    const biome = getCurrentBiome();
    const vanishY = h * VANISH_Y_RATIO;
    const cx = w / 2;

    // -- Sky --
    const skyGrad = ctx.createLinearGradient(0, 0, 0, vanishY);
    skyGrad.addColorStop(0, colors.sky[0]);
    skyGrad.addColorStop(1, colors.sky[1]);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, vanishY + 10);

    // -- Horizon decorations --
    drawHorizon(w, h, vanishY, biome);

    // -- Ground (outside road) --
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, vanishY, w, h - vanishY);

    // -- Road with perspective --
    const roadBottomLeft = cx - w * ROAD_BOTTOM_WIDTH / 2;
    const roadBottomRight = cx + w * ROAD_BOTTOM_WIDTH / 2;
    const roadTopLeft = cx - w * ROAD_TOP_WIDTH / 2;
    const roadTopRight = cx + w * ROAD_TOP_WIDTH / 2;

    // Road surface
    ctx.fillStyle = colors.road;
    ctx.beginPath();
    ctx.moveTo(roadBottomLeft, h);
    ctx.lineTo(roadTopLeft, vanishY);
    ctx.lineTo(roadTopRight, vanishY);
    ctx.lineTo(roadBottomRight, h);
    ctx.closePath();
    ctx.fill();

    // Road edge lines
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roadBottomLeft, h);
    ctx.lineTo(roadTopLeft, vanishY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(roadBottomRight, h);
    ctx.lineTo(roadTopRight, vanishY);
    ctx.stroke();

    // Lane divider lines (dashed)
    ctx.strokeStyle = colors.roadLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 12]);
    for (let i = 1; i < 3; i++) {
        const frac = i / 3;
        const bx = roadBottomLeft + (roadBottomRight - roadBottomLeft) * frac;
        const tx = roadTopLeft + (roadTopRight - roadTopLeft) * frac;
        ctx.beginPath();
        ctx.moveTo(bx, h);
        ctx.lineTo(tx, vanishY);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // -- Road dashes (center, scrolling) --
    ctx.strokeStyle = colors.roadLine;
    ctx.lineWidth = 2;
    const dashCount = 20;
    for (let i = 0; i < dashCount; i++) {
        // Evenly spaced in perspective-T space
        let rawT = ((i / dashCount) + (frameCount * gameSpeed * 0.001)) % 1;
        // Non-linear: accelerate towards camera
        let t = rawT * rawT;
        let sy = vanishY + (h - vanishY) * t;
        let halfW = getRoadHalfWidth(sy);
        let laneW = (halfW * 2) / 3;
        // Draw dash in each lane
        let dashLen = 6 * t + 1;
        ctx.globalAlpha = t;
        for (let lane = 0; lane < 2; lane++) {
            let dx = cx - halfW + laneW * (lane + 1);
            ctx.beginPath();
            ctx.moveTo(dx, sy - dashLen);
            ctx.lineTo(dx, sy + dashLen);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;

    // -- Sort all objects by Y for correct draw order --
    let drawList = [];

    for (let o of obstacles) {
        if (o.y >= vanishY - 5 && o.y < h + 50) {
            drawList.push({ type: 'obstacle', obj: o, y: o.y });
        }
    }
    for (let c of coins) {
        if (!c.collected && c.y >= vanishY - 5 && c.y < h + 30) {
            drawList.push({ type: 'coin', obj: c, y: c.y });
        }
    }
    for (let p of powerups) {
        if (!p.collected && p.y >= vanishY - 5 && p.y < h + 30) {
            drawList.push({ type: 'powerup', obj: p, y: p.y });
        }
    }
    if (rover.active && rover.leaping) {
        drawList.push({ type: 'rover', obj: rover, y: rover.y });
    }
    // Farmer Joe net
    if (farmerJoe.netActive) {
        drawList.push({ type: 'net', obj: farmerJoe, y: farmerJoe.netY });
    }
    // Helicopter drops
    for (let d of helicopter.drops) {
        drawList.push({ type: 'helidrop', obj: d, y: d.y });
    }
    // Player
    drawList.push({ type: 'player', obj: player, y: player.y + player.jumpY });

    // Sort by Y ascending (further things drawn first)
    drawList.sort((a, b) => a.y - b.y);

    for (let item of drawList) {
        switch(item.type) {
            case 'obstacle': drawObstacle(item.obj); break;
            case 'coin':     drawCoin(item.obj); break;
            case 'powerup':  drawPowerup(item.obj); break;
            case 'rover':    drawRover(); break;
            case 'net':      drawFarmerNet(); break;
            case 'helidrop': drawHeliDrop(item.obj); break;
            case 'player':   drawPlayer(); break;
        }
    }

    // -- Rover warning (above everything) --
    if (rover.active && rover.warning) {
        const rx = getLaneXAtY(rover.lane, h * 0.5);
        ctx.fillStyle = COLORS.barnRed;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ 🐕', rx, h * 0.45 + Math.sin(frameCount * 0.2) * 5);
    }

    // -- Helicopter (drawn above scene) --
    if (helicopter.active) drawHelicopter(w, h, vanishY);

    // -- Farmer Joe closeness indicator --
    if (farmerJoe.active && farmerJoe.closeness > 10) drawFarmerJoeIndicator(w, h);

    // -- Particles --
    for (let p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // -- Turbo effect --
    if (player.turboActive) {
        ctx.fillStyle = 'rgba(78, 192, 233, 0.08)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const sx = player.x + (Math.random() - 0.5) * 80;
            const sy = player.y - Math.random() * h * 0.3;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + 30 + Math.random()*20); ctx.stroke();
        }
    }

    // Ambient
    ctx.fillStyle = colors.ambient;
    ctx.fillRect(0, 0, w, h);
}

function drawHorizon(w, h, vanishY, biome) {
    if (biome === 'barnyard') {
        // Barn
        ctx.fillStyle = COLORS.barnRed;
        ctx.fillRect(w * 0.08, vanishY - 50, 60, 50);
        ctx.fillStyle = '#8B0000';
        ctx.beginPath();
        ctx.moveTo(w*0.08-3, vanishY-50); ctx.lineTo(w*0.08+30, vanishY-72); ctx.lineTo(w*0.08+63, vanishY-50);
        ctx.fill();
        // Silo
        ctx.fillStyle = '#999';
        ctx.fillRect(w*0.85, vanishY-55, 22, 55);
        ctx.fillStyle = '#777';
        ctx.beginPath(); ctx.arc(w*0.85+11, vanishY-55, 11, Math.PI, 0); ctx.fill();
        // Trees
        for (let i = 0; i < 5; i++) {
            const tx = w*0.25 + i*w*0.12;
            ctx.fillStyle = '#2E7D32';
            ctx.beginPath(); ctx.arc(tx, vanishY-15, 14, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(tx-2, vanishY-5, 4, 10);
        }
    } else if (biome === 'harvest') {
        // Windmill
        const wmx = w * 0.12;
        ctx.fillStyle = '#8D6E63';
        ctx.fillRect(wmx-5, vanishY-55, 10, 55);
        ctx.save();
        ctx.translate(wmx, vanishY-55);
        ctx.rotate(frameCount * 0.02);
        ctx.fillStyle = '#A1887F';
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI/2); ctx.fillRect(-2, 0, 4, 22); }
        ctx.restore();
        // Corn
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = '#F9C846';
            ctx.fillRect(w*0.3 + i*w*0.08, vanishY - 10 - Math.random()*8, 2, 14);
        }
    } else {
        // Highway signs
        ctx.fillStyle = '#666'; ctx.fillRect(w*0.1, vanishY-30, 3, 30);
        ctx.fillStyle = '#2E7D32'; ctx.fillRect(w*0.1-15, vanishY-40, 36, 14);
        ctx.fillStyle = '#FFF'; ctx.font = '7px sans-serif'; ctx.fillText('EXIT', w*0.1-8, vanishY-31);
        // Guardrails
        ctx.fillStyle = '#999';
        for (let i = 0; i < 8; i++) ctx.fillRect(w*0.3+i*45, vanishY-3, 25, 2);
    }
}

function drawObstacle(o) {
    const scale = getScaleAtY(o.y);
    const x = getLaneXAtY(o.lane, o.y);
    const y = o.y;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    switch(o.type) {
        case 'fence':
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(-25, -15, 50, 6); ctx.fillRect(-25, -3, 50, 6);
            ctx.fillStyle = '#A0875A';
            ctx.fillRect(-22, -20, 5, 35); ctx.fillRect(17, -20, 5, 35); ctx.fillRect(-2, -20, 5, 35);
            break;
        case 'haybale':
            ctx.fillStyle = '#DAA520';
            ctx.beginPath(); ctx.ellipse(0, 0, 25, 18, 0, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(0, 0, 25, 18, 0, 0, Math.PI*2); ctx.stroke();
            ctx.strokeStyle = '#CD950C';
            for (let i = -18; i < 18; i += 6) { ctx.beginPath(); ctx.moveTo(i, -12); ctx.lineTo(i, 12); ctx.stroke(); }
            break;
        case 'barrier':
            ctx.fillStyle = '#D9383A';
            ctx.fillRect(-25, -20, 50, 12);
            ctx.fillStyle = '#FFF';
            for (let i = 0; i < 4; i++) ctx.fillRect(-22+i*14, -18, 8, 8);
            ctx.fillStyle = '#888';
            ctx.fillRect(-22, -8, 5, 30); ctx.fillRect(17, -8, 5, 30);
            break;
        case 'tractor':
            ctx.fillStyle = '#D9383A'; ctx.fillRect(-22, -14, 44, 28);
            ctx.fillStyle = '#B71C1C'; ctx.fillRect(-15, -28, 20, 18);
            ctx.fillStyle = '#81D4FA'; ctx.fillRect(-12, -25, 14, 10);
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.arc(-15, 16, 10, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(15, 16, 14, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#888';
            ctx.beginPath(); ctx.arc(-15, 16, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(15, 16, 5, 0, Math.PI*2); ctx.fill();
            break;
        case 'truck':
            ctx.fillStyle = '#1565C0'; ctx.fillRect(-25, -22, 50, 35);
            ctx.fillStyle = '#0D47A1'; ctx.fillRect(-25, 13, 20, 20);
            ctx.fillStyle = '#B3E5FC'; ctx.fillRect(-22, 15, 14, 10);
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.arc(-18, 36, 8, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(15, 36, 8, 0, Math.PI*2); ctx.fill();
            break;
        case 'mud':
            ctx.fillStyle = 'rgba(107, 66, 38, 0.7)';
            ctx.beginPath(); ctx.ellipse(0, 0, 28, 10, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(80, 50, 20, 0.5)';
            ctx.beginPath(); ctx.arc(-8, -3, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(10, 2, 3, 0, Math.PI*2); ctx.fill();
            break;
    }
    ctx.restore();
}

function drawCoin(c) {
    const scale = getScaleAtY(c.y);
    const x = getLaneXAtY(c.lane, c.y);
    const size = c.baseSize * scale;
    const glow = Math.sin(c.sparkle) * 0.3 + 0.7;

    ctx.save();
    ctx.globalAlpha = glow * Math.min(1, scale * 2);

    ctx.fillStyle = 'rgba(249, 200, 70, 0.3)';
    ctx.beginPath(); ctx.arc(x, c.y, size + 3, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = COLORS.strawYellow;
    ctx.beginPath(); ctx.arc(x, c.y, size, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = COLORS.cowbellGold; ctx.lineWidth = Math.max(1, 2*scale);
    ctx.beginPath(); ctx.arc(x, c.y, size - 3*scale, 0, Math.PI*2); ctx.stroke();

    if (scale > 0.4) {
        ctx.fillStyle = COLORS.cowbellGold;
        ctx.font = `bold ${Math.floor(12*scale)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('¢', x, c.y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawPowerup(p) {
    const scale = getScaleAtY(p.y);
    const x = getLaneXAtY(p.lane, p.y);
    const size = p.baseSize * scale;
    const glow = Math.sin(p.glow * 2) * 4 + 6;

    ctx.save();
    ctx.globalAlpha = Math.min(1, scale * 2.5);

    ctx.strokeStyle = p.type === 'turbo' ? '#4EC0E9' : p.type === 'magnet' ? '#E8A923' : '#7CBC37';
    ctx.lineWidth = Math.max(1, 2*scale);
    ctx.beginPath(); ctx.arc(x, p.y, size + glow*scale, 0, Math.PI*2); ctx.stroke();

    ctx.fillStyle = p.type === 'turbo' ? 'rgba(78,192,233,0.5)' : p.type === 'magnet' ? 'rgba(232,169,35,0.5)' : 'rgba(124,188,55,0.5)';
    ctx.beginPath(); ctx.arc(x, p.y, size, 0, Math.PI*2); ctx.fill();

    if (scale > 0.35) {
        ctx.font = `${Math.floor(18*scale)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.type === 'turbo' ? '🥛' : p.type === 'magnet' ? '🧲' : '🛡️', x, p.y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawPlayer() {
    const px = player.x;
    const py = player.y + player.jumpY;
    const sliding = player.sliding;
    const stumble = player.stumbleTimer > 0;

    ctx.save();
    ctx.translate(px, py);

    // Turbo aura
    if (player.turboActive) {
        ctx.fillStyle = 'rgba(78, 192, 233, 0.2)';
        ctx.beginPath(); ctx.arc(0, -10, 40, 0, Math.PI*2); ctx.fill();
    }
    // Shield bubble
    if (player.hasShield) {
        ctx.strokeStyle = 'rgba(78, 192, 233, 0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -10, 38, 0, Math.PI*2); ctx.stroke();
    }

    if (stumble) ctx.rotate(Math.sin(frameCount * 0.5) * 0.1);
    if (sliding) { ctx.translate(0, 20); ctx.scale(1.3, 0.5); }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 20, 22, 6, 0, 0, Math.PI*2); ctx.fill();

    const bounce = player.jumping ? 0 : Math.sin(player.animFrame * Math.PI / 2) * 3;

    // Body
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.ellipse(0, -5-bounce, 22, 18, 0, 0, Math.PI*2); ctx.fill();

    // Black patches
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.ellipse(-8, -12-bounce, 8, 6, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, 0-bounce, 6, 5, 0.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-5, 5-bounce, 5, 4, 0, 0, Math.PI*2); ctx.fill();

    // Head
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(0, -28-bounce, 14, 0, Math.PI*2); ctx.fill();

    // Snout
    ctx.fillStyle = '#FFCCAA';
    ctx.beginPath(); ctx.ellipse(0, -22-bounce, 8, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#D4956A';
    ctx.beginPath(); ctx.arc(-3, -21-bounce, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -21-bounce, 2, 0, Math.PI*2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(-6, -32-bounce, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -32-bounce, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(-5, -33-bounce, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -33-bounce, 1.2, 0, Math.PI*2); ctx.fill();

    // Ears
    ctx.fillStyle = '#EEE';
    ctx.beginPath(); ctx.ellipse(-12, -36-bounce, 6, 4, -0.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -36-bounce, 6, 4, 0.5, 0, Math.PI*2); ctx.fill();

    // Horns
    ctx.fillStyle = '#F5DEB3';
    ctx.beginPath(); ctx.moveTo(-8, -40-bounce); ctx.lineTo(-12, -50-bounce); ctx.lineTo(-5, -42-bounce); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, -40-bounce); ctx.lineTo(12, -50-bounce); ctx.lineTo(5, -42-bounce); ctx.fill();

    // Bell collar
    ctx.fillStyle = '#D9383A'; ctx.fillRect(-8, -16-bounce, 16, 3);
    ctx.fillStyle = COLORS.cowbellGold;
    ctx.beginPath(); ctx.arc(0, -12-bounce, 4, 0, Math.PI*2); ctx.fill();

    // Legs
    ctx.fillStyle = '#FFF';
    const legPhase = player.animFrame;
    const frontLeg = Math.sin(legPhase * Math.PI / 2) * 6;
    const backLeg = -frontLeg;
    ctx.fillRect(-10, 12-bounce, 5, 12+frontLeg);
    ctx.fillRect(5, 12-bounce, 5, 12+backLeg);
    ctx.fillStyle = '#333';
    ctx.fillRect(-11, 23-bounce+frontLeg, 7, 3);
    ctx.fillRect(4, 23-bounce+backLeg, 7, 3);

    // Tail
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 8-bounce);
    ctx.quadraticCurveTo(18, 5-bounce+Math.sin(frameCount*0.1)*5, 20, -5-bounce);
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(20, -5-bounce, 3, 0, Math.PI*2); ctx.fill();

    // Skin overlays
    if (activeSkin === 'golden') {
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#FFD700';
        ctx.beginPath(); ctx.ellipse(0, -5-bounce, 22, 18, 0, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    } else if (activeSkin === 'superhero') {
        ctx.fillStyle = '#D9383A';
        ctx.beginPath(); ctx.moveTo(-8,-15-bounce); ctx.lineTo(-15,15-bounce); ctx.lineTo(15,15-bounce); ctx.lineTo(8,-15-bounce); ctx.fill();
    } else if (activeSkin === 'wizard') {
        ctx.fillStyle = '#4A148C';
        ctx.beginPath(); ctx.moveTo(0,-58-bounce); ctx.lineTo(-14,-36-bounce); ctx.lineTo(14,-36-bounce); ctx.fill();
        ctx.fillStyle = COLORS.cowbellGold;
        ctx.beginPath(); ctx.arc(0,-45-bounce,3,0,Math.PI*2); ctx.fill();
    }

    ctx.restore();
}

function drawRover() {
    const scale = getScaleAtY(rover.y);
    const rx = getLaneXAtY(rover.lane, rover.y);

    ctx.save();
    ctx.translate(rx, rover.y);
    ctx.scale(scale, scale);

    // Dog body
    ctx.fillStyle = '#8B4513';
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#A0522D';
    ctx.beginPath(); ctx.arc(0, -16, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#6B3410';
    ctx.beginPath(); ctx.ellipse(-8, -22, 5, 7, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, -22, 5, 7, 0.3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(-4, -18, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -18, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-4, -18, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -18, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(0, -12, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-12, 10, 4, 10); ctx.fillRect(8, 10, 4, 10);

    ctx.restore();
}

function drawFarmerNet() {
    const netX = getLaneXAtY(farmerJoe.netLane, farmerJoe.netY);
    const scale = getScaleAtY(farmerJoe.netY);

    ctx.save();
    ctx.translate(netX, farmerJoe.netY);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#654321'; ctx.lineWidth = 2;
    for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath(); ctx.moveTo(i, -15); ctx.lineTo(i, 15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-15, i); ctx.lineTo(15, i); ctx.stroke();
    }

    ctx.restore();
}

function drawHeliDrop(d) {
    const dx = getLaneXAtY(d.lane, d.y);
    const scale = getScaleAtY(d.y);

    ctx.save();
    ctx.translate(dx, d.y);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(100, 50, 0, 0.7)';
    ctx.strokeStyle = '#654321'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(100, 70, 30, 0.6)';
    for (let i = -15; i <= 15; i += 5) {
        ctx.beginPath(); ctx.moveTo(i, -18); ctx.lineTo(i, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-18, i); ctx.lineTo(18, i); ctx.stroke();
    }

    ctx.restore();
}

function drawHelicopter(w, h, vanishY) {
    const hx = helicopter.x;
    const hy = vanishY - 40;

    ctx.save();
    // Spotlight
    ctx.fillStyle = `rgba(255, 255, 200, ${helicopter.spotlightOpacity})`;
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy + 15); ctx.lineTo(hx - 40, h); ctx.lineTo(hx + 40, h); ctx.lineTo(hx + 8, hy + 15);
    ctx.fill();

    // Body
    ctx.fillStyle = '#37474F';
    ctx.beginPath(); ctx.ellipse(hx, hy, 25, 12, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#455A64';
    ctx.fillRect(hx+16, hy-4, 22, 6); ctx.fillRect(hx+34, hy-12, 4, 14);
    ctx.fillStyle = '#B3E5FC';
    ctx.beginPath(); ctx.ellipse(hx-8, hy-2, 10, 7, 0, Math.PI, 0); ctx.fill();
    // Rotor
    ctx.strokeStyle = '#666'; ctx.lineWidth = 3;
    const ra = frameCount * 0.3;
    ctx.beginPath(); ctx.moveTo(hx-Math.cos(ra)*30, hy-13); ctx.lineTo(hx+Math.cos(ra)*30, hy-13); ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(hx, hy-13, 3, 0, Math.PI*2); ctx.fill();

    ctx.restore();
}

function drawFarmerJoeIndicator(w, h) {
    const closeness = farmerJoe.closeness;
    const alpha = Math.min(closeness / 100, 0.8);

    ctx.fillStyle = `rgba(217, 56, 58, ${alpha * 0.3})`;
    ctx.fillRect(0, h - 60, w, 60);
    ctx.fillStyle = `rgba(255,255,255, ${alpha})`;
    ctx.font = '13px Fredoka One, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`👨‍🌾 Farmer Joe is close! (${Math.floor(closeness)}%)`, w/2, h-32);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(w/2-70, h-20, 140, 8);
    ctx.fillStyle = closeness > 70 ? '#D9383A' : '#E8A923';
    ctx.fillRect(w/2-70, h-20, 140*(closeness/100), 8);
}

// ---- Kiki Tips ----
function showKikiTip(text) {
    const tipEl = document.getElementById('kikiTip');
    const textEl = document.getElementById('kikiText');
    textEl.textContent = text;
    tipEl.style.display = 'flex';
    tipEl.style.animation = 'none';
    tipEl.offsetHeight;
    tipEl.style.animation = 'tipSlide 0.3s ease-out';
    setTimeout(() => { tipEl.style.display = 'none'; }, 3000);
}

// ---- Screen Management ----
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

    const badgesEl = document.getElementById('gameOverBadges');
    badgesEl.innerHTML = '';
    if (finalDist >= 500)  addBadge(badgesEl, '🥉 500m Runner');
    if (finalDist >= 1000) addBadge(badgesEl, '🥈 1000m Champion');
    if (finalDist >= 2000) addBadge(badgesEl, '🥇 2000m Legend');
    if (finalCoins >= 50)  addBadge(badgesEl, '💰 Coin Collector');
    if (finalCoins >= 100) addBadge(badgesEl, '🤑 Rich Cow');

    setTimeout(() => showScreen('gameOverScreen'), 500);
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
    drawMenuBackground();
}

function updateMenuUI() {
    document.getElementById('menuHighScore').textContent = highScore;
    document.getElementById('menuCoins').textContent = totalCoins;
}

function drawMenuBackground() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4EC0E9');
    grad.addColorStop(0.5, '#87CEEB');
    grad.addColorStop(0.7, '#7CBC37');
    grad.addColorStop(1, '#5a9a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(w*0.2, h*0.15, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(w*0.25, h*0.12, 25, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(w*0.7, h*0.2, 35, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(w*0.75, h*0.17, 28, 0, Math.PI*2); ctx.fill();
}

// ---- Shop ----
const shopItems = [
    { id: 'golden', name: 'Golden Cow', icon: '✨🐄', price: 500, type: 'skin' },
    { id: 'superhero', name: 'Super Cow', icon: '🦸🐄', price: 800, type: 'skin' },
    { id: 'wizard', name: 'Wizard Cow', icon: '🧙🐄', price: 1200, type: 'skin' },
    { id: 'multiplier2x', name: '2x Score', icon: '⭐×2', price: 1000, type: 'upgrade' },
    { id: 'multiplier3x', name: '3x Score', icon: '⭐×3', price: 2500, type: 'upgrade' },
];

function openShop() {
    sfxClick();
    showScreen('shopScreen');
    document.getElementById('shopCoins').textContent = totalCoins;
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';

    // Default skin
    const defaultDiv = document.createElement('div');
    defaultDiv.className = 'shop-item' + (activeSkin === 'default' ? ' owned' : '');
    defaultDiv.innerHTML = `<span class="shop-item-icon">🐄</span><span class="shop-item-name">Classic Moo</span><span class="shop-item-price">${activeSkin === 'default' ? '✅ Equipped' : 'Free'}</span>`;
    defaultDiv.addEventListener('click', () => { activeSkin = 'default'; saveData(); sfxClick(); openShop(); });
    grid.appendChild(defaultDiv);

    for (let item of shopItems) {
        const owned = ownedSkins.includes(item.id) || (item.id === 'multiplier2x' && scoreMultiplier >= 2) || (item.id === 'multiplier3x' && scoreMultiplier >= 3);
        const div = document.createElement('div');
        div.className = 'shop-item' + (owned ? ' owned' : '');
        div.innerHTML = `<span class="shop-item-icon">${item.icon}</span><span class="shop-item-name">${item.name}</span><span class="shop-item-price">${owned ? (item.type==='skin' ? (activeSkin===item.id?'✅ Equipped':'Owned') : '✅ Owned') : '🪙 '+item.price}</span>`;
        div.addEventListener('click', () => {
            if (owned && item.type === 'skin') { activeSkin = item.id; saveData(); openShop(); sfxClick(); }
            else if (!owned && totalCoins >= item.price) {
                totalCoins -= item.price;
                if (item.type === 'skin') { ownedSkins.push(item.id); activeSkin = item.id; }
                else if (item.id === 'multiplier2x') scoreMultiplier = 2;
                else if (item.id === 'multiplier3x') scoreMultiplier = 3;
                saveData(); sfxPowerup(); openShop();
            } else if (!owned) sfxCrash();
        });
        grid.appendChild(div);
    }
}

// ---- Event Listeners ----
document.getElementById('playBtn').addEventListener('click', () => { sfxClick(); startGame(); });
document.getElementById('shopBtn').addEventListener('click', openShop);
document.getElementById('dailyBtn').addEventListener('click', () => {
    sfxClick(); startGame(); gameSpeed = 10; distance = 500;
    showKikiTip("Daily Challenge: Start at 500m! 🏃‍♂️💨");
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

// ---- Game Loop ----
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

// ---- Init ----
updateMenuUI();
drawMenuBackground();
document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('click', initAudio, { once: true });

})();
