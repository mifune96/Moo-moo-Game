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
const BASE_SPEED = 5;        // pixels per frame base
const MAX_SPEED = 18;
const SPEED_INCREASE_RATE = 0.0003; // per frame
const LANE_WIDTH_RATIO = 0.22;

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

// Background music — simple country melody loop
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
let state = 'menu'; // menu, playing, paused, gameover
let distance = 0;   // meters
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
    lane: 1,        // 0, 1, 2
    targetLane: 1,
    x: 0, y: 0,
    width: 50, height: 60,
    jumping: false,
    jumpY: 0,
    jumpVel: 0,
    sliding: false,
    slideTimer: 0,
    hasShield: false,
    // Power-ups
    turboActive: false,
    turboTimer: 0,
    magnetActive: false,
    magnetTimer: 0,
    // Animation
    animFrame: 0,
    animTimer: 0,
    stumbleTimer: 0,
};

// ---- Enemies ----
// Farmer Joe - chases from behind
const farmerJoe = {
    active: false,
    distance: -100, // behind player
    closeness: 0,   // 0-100, at 100 = caught
    throwTimer: 0,
    netActive: false,
    netLane: 1,
    netY: 0,
};

// Rover the Dog
const rover = {
    active: false,
    lane: -1,
    y: 0,
    warning: false,
    warningTimer: 0,
    leaping: false,
};

// Farm Helicopter (boss)
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
let roadStripes = [];
let decorations = [];

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
let currentTip = '';

// ---- Biome / Level Management ----
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
                ambient: 'rgba(255,255,200,0.1)',
            };
        case 'harvest':
            return {
                sky: ['#F5A623', '#F9C846'],
                ground: '#D4A017',
                road: '#8B6914',
                roadLine: '#E8A923',
                ambient: 'rgba(255,180,50,0.15)',
            };
        case 'highway':
            return {
                sky: ['#4EC0E9', '#B0D4E8'],
                ground: '#666',
                road: '#444',
                roadLine: '#FFF',
                ambient: 'rgba(200,200,255,0.08)',
            };
    }
}

// ---- Lane Positions ----
function getLaneX(lane) {
    const w = W();
    const laneW = w * LANE_WIDTH_RATIO;
    const totalW = laneW * LANE_COUNT;
    const startX = (w - totalW) / 2;
    return startX + laneW * lane + laneW / 2;
}

function getLaneWidth() {
    return W() * LANE_WIDTH_RATIO;
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
    player.x = getLaneX(1);
    player.y = H() * 0.72;
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
    roadStripes = [];
    decorations = [];

    // Pre-generate road stripes
    for (let i = 0; i < 20; i++) {
        roadStripes.push({ y: i * 80 });
    }

    lastTipTime = 0;
    currentTip = '';
}

// ---- Obstacle Generation ----
let lastObstacleY = -200;

function spawnObstacle() {
    const biome = getCurrentBiome();
    const minGap = Math.max(120, 250 - distance * 0.05);
    
    if (lastObstacleY > -minGap) return;
    
    const lane = Math.floor(Math.random() * 3);
    let type, width, height, jumpable, slideable;
    
    if (biome === 'barnyard') {
        const r = Math.random();
        if (r < 0.4) {
            type = 'fence'; width = 55; height = 35; jumpable = true; slideable = false;
        } else if (r < 0.7) {
            type = 'haybale'; width = 50; height = 40; jumpable = true; slideable = false;
        } else {
            type = 'barrier'; width = 55; height = 50; jumpable = false; slideable = true;
        }
    } else if (biome === 'harvest') {
        const r = Math.random();
        if (r < 0.3) {
            type = 'tractor'; width = 60; height = 55; jumpable = false; slideable = false;
        } else if (r < 0.5) {
            type = 'mud'; width = 55; height = 20; jumpable = true; slideable = false;
        } else if (r < 0.75) {
            type = 'fence'; width = 55; height = 35; jumpable = true; slideable = false;
        } else {
            type = 'barrier'; width = 55; height = 50; jumpable = false; slideable = true;
        }
    } else {
        const r = Math.random();
        if (r < 0.35) {
            type = 'truck'; width = 60; height = 60; jumpable = false; slideable = false;
        } else if (r < 0.55) {
            type = 'barrier'; width = 55; height = 50; jumpable = false; slideable = true;
        } else if (r < 0.8) {
            type = 'fence'; width = 55; height = 35; jumpable = true; slideable = false;
        } else {
            type = 'tractor'; width = 60; height = 55; jumpable = false; slideable = false;
        }
    }
    
    obstacles.push({
        type, lane, width, height,
        x: getLaneX(lane),
        y: -height,
        jumpable, slideable,
        hit: false,
    });
    
    lastObstacleY = 0;
    
    // Occasionally spawn double obstacles
    if (distance > 300 && Math.random() < 0.3) {
        let lane2 = (lane + (Math.random() < 0.5 ? 1 : 2)) % 3;
        obstacles.push({
            type, lane: lane2, width, height,
            x: getLaneX(lane2),
            y: -height - 10,
            jumpable, slideable,
            hit: false,
        });
    }
}

function spawnCoin() {
    if (Math.random() > 0.04) return;
    const lane = Math.floor(Math.random() * 3);
    const count = Math.random() < 0.3 ? 3 : 1;
    for (let i = 0; i < count; i++) {
        coins.push({
            lane, x: getLaneX(lane), y: -30 - i * 40,
            collected: false, size: 16,
            sparkle: 0,
        });
    }
}

function spawnPowerup() {
    if (Math.random() > 0.004) return;
    const lane = Math.floor(Math.random() * 3);
    const types = ['turbo', 'magnet', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    powerups.push({
        type, lane, x: getLaneX(lane), y: -30,
        collected: false, size: 22, glow: 0,
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

function spawnCoinParticle(x, y) {
    spawnParticles(x, y, COLORS.strawYellow, 4, 2);
}

// ---- Player Actions ----
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
        case 'ArrowLeft': case 'a': case 'A':
            moveLeft(); break;
        case 'ArrowRight': case 'd': case 'D':
            moveRight(); break;
        case 'ArrowUp': case 'w': case 'W': case ' ':
            e.preventDefault();
            jump(); break;
        case 'ArrowDown': case 's': case 'S':
            slide(); break;
        case 'Escape': case 'p': case 'P':
            pauseGame(); break;
    }
});

// Touch/Swipe handling
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
    
    if (dt > 500) return; // too slow
    
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    if (absDx > 30 && absDx > absDy) {
        if (dx > 0) moveRight();
        else moveLeft();
    } else if (absDy > 30 && absDy > absDx) {
        if (dy < 0) jump();
        else slide();
    }
}, { passive: true });

// ---- Collision Detection ----
function checkCollision(obj) {
    const px = player.x;
    const py = player.y + player.jumpY;
    const pw = player.width * 0.6;
    const ph = player.sliding ? player.height * 0.4 : player.height;
    const py2 = player.sliding ? py + player.height * 0.6 : py;
    
    return (
        Math.abs(px - obj.x) < (pw + obj.width) / 2 &&
        py2 < obj.y + obj.height &&
        py2 + ph > obj.y
    );
}

// ---- Update Game ----
function update(dt) {
    if (state !== 'playing') return;
    
    frameCount++;
    
    // Speed increases by 5% every 200 meters (GDD spec)
    const speedMultiplier = 1 + Math.floor(distance / 200) * 0.05;
    gameSpeed = Math.min(BASE_SPEED * speedMultiplier, MAX_SPEED);
    
    if (player.turboActive) gameSpeed = MAX_SPEED;
    
    // Distance (1 pixel ≈ 0.1m scale)
    const metersDelta = gameSpeed * 0.15;
    distance += metersDelta;
    score = Math.floor(distance * 10 * scoreMultiplier);
    
    // -- Player update --
    // Lane movement (smooth)
    const targetX = getLaneX(player.targetLane);
    player.x += (targetX - player.x) * 0.2;
    player.lane = player.targetLane;
    
    // Jump physics
    if (player.jumping) {
        player.jumpVel += 0.8; // gravity
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
    
    // Stumble recovery
    if (player.stumbleTimer > 0) player.stumbleTimer--;
    
    // Animation
    player.animTimer++;
    if (player.animTimer > 6) { player.animFrame = (player.animFrame + 1) % 4; player.animTimer = 0; }
    
    // -- Power-ups timer --
    if (player.turboActive) {
        player.turboTimer -= dt;
        if (player.turboTimer <= 0) { player.turboActive = false; player.turboTimer = 0; }
    }
    if (player.magnetActive) {
        player.magnetTimer -= dt;
        if (player.magnetTimer <= 0) { player.magnetActive = false; player.magnetTimer = 0; }
    }
    
    // -- Obstacle spawning --
    lastObstacleY -= gameSpeed;
    if (frameCount % 3 === 0) spawnObstacle();
    spawnCoin();
    spawnPowerup();
    
    // -- Move obstacles --
    for (let o of obstacles) {
        o.y += gameSpeed;
        o.x = getLaneX(o.lane); // update x in case of resize
    }
    obstacles = obstacles.filter(o => o.y < H() + 100);
    
    // -- Move coins --
    for (let c of coins) {
        c.y += gameSpeed;
        c.sparkle += 0.1;
        c.x = getLaneX(c.lane);
        
        // Magnet effect
        if (player.magnetActive && !c.collected) {
            const dx = player.x - c.x;
            const dy = (player.y + player.jumpY) - c.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 200) {
                c.x += dx * 0.15;
                c.y += dy * 0.15;
            }
        }
    }
    coins = coins.filter(c => c.y < H() + 50 && !c.collected);
    
    // -- Move powerups --
    for (let p of powerups) {
        p.y += gameSpeed;
        p.glow += 0.08;
        p.x = getLaneX(p.lane);
    }
    powerups = powerups.filter(p => p.y < H() + 50 && !p.collected);
    
    // -- Road stripes --
    for (let s of roadStripes) {
        s.y += gameSpeed;
        if (s.y > H() + 20) s.y -= roadStripes.length * 80;
    }
    
    // -- Particles --
    for (let p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= p.decay;
    }
    particles = particles.filter(p => p.life > 0);
    
    // -- Collision: Obstacles --
    for (let o of obstacles) {
        if (o.hit) continue;
        
        // Can jump over jumpable obstacles
        if (o.jumpable && player.jumping && player.jumpY < -20) continue;
        // Can slide under slideable obstacles
        if (o.slideable && player.sliding) continue;
        
        if (checkCollision(o)) {
            o.hit = true;
            
            // Turbo smashes through everything
            if (player.turboActive) {
                spawnParticles(o.x, o.y, '#FFF', 8, 5);
                continue;
            }
            
            // Mud just slows down
            if (o.type === 'mud') {
                player.stumbleTimer = 30;
                spawnParticles(o.x, o.y, COLORS.mud, 6, 3);
                sfxSlide();
                continue;
            }
            
            // Shield absorbs hit
            if (player.hasShield) {
                player.hasShield = false;
                player.stumbleTimer = 20;
                spawnParticles(o.x, o.y, COLORS.skyBlue, 10, 4);
                document.getElementById('hudShield').style.display = 'none';
                sfxCrash();
                continue;
            }
            
            // Game over
            sfxCrash();
            spawnParticles(o.x, o.y, COLORS.barnRed, 15, 5);
            gameOver(`Crashed into a ${o.type}!`);
            return;
        }
    }
    
    // -- Collision: Coins --
    for (let c of coins) {
        if (c.collected) continue;
        const dx = player.x - c.x;
        const dy = (player.y + player.jumpY) - c.y;
        if (Math.sqrt(dx*dx + dy*dy) < 35) {
            c.collected = true;
            coinsCollected++;
            spawnCoinParticle(c.x, c.y);
            sfxCoin();
        }
    }
    
    // -- Collision: Powerups --
    for (let p of powerups) {
        if (p.collected) continue;
        const dx = player.x - p.x;
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
    
    // -- Farmer Joe (pursuer) --
    if (farmerJoe.active) {
        // Gets closer when player stumbles
        if (player.stumbleTimer > 0) {
            farmerJoe.closeness += 0.3;
        } else if (player.turboActive) {
            farmerJoe.closeness = Math.max(0, farmerJoe.closeness - 2);
        } else {
            farmerJoe.closeness = Math.max(0, farmerJoe.closeness - 0.05);
        }
        
        // Net throwing
        farmerJoe.throwTimer += dt;
        if (farmerJoe.throwTimer > 8 && distance > 100 && farmerJoe.closeness > 30) {
            farmerJoe.throwTimer = 0;
            farmerJoe.netActive = true;
            farmerJoe.netLane = player.lane;
            farmerJoe.netY = H() + 50;
        }
        
        if (farmerJoe.netActive) {
            farmerJoe.netY -= gameSpeed * 0.5;
            if (farmerJoe.netY < -50) farmerJoe.netActive = false;
            
            // Check if net hits player
            const netX = getLaneX(farmerJoe.netLane);
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
    
    // -- Rover the Dog (appears after 500m) --
    if (distance > BIOME_HARVEST && !rover.active && Math.random() < 0.001) {
        rover.active = true;
        rover.lane = Math.floor(Math.random() * 3);
        rover.y = -60;
        rover.warning = true;
        rover.warningTimer = 90; // 1.5 seconds at 60fps
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
                rover.lane = player.lane; // targets player's current lane
                rover.y = -60;
            }
        }
        if (rover.leaping) {
            rover.y += gameSpeed * 1.5;
            const rx = getLaneX(rover.lane);
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
            if (rover.y > H() + 100) rover.active = false;
        }
    }
    
    // -- Helicopter (appears after 1500m) --
    if (distance > BIOME_HIGHWAY && !helicopter.active && Math.random() < 0.0005) {
        helicopter.active = true;
        helicopter.x = player.x;
        helicopter.targetLane = player.lane;
        helicopter.dropTimer = 120; // 2 seconds
        helicopter.drops = [];
        showKikiTip("Helicopter spotted! Watch for nets! 🚁");
    }
    
    if (helicopter.active) {
        helicopter.x += (getLaneX(helicopter.targetLane) - helicopter.x) * 0.03;
        helicopter.spotlightOpacity = 0.1 + Math.sin(frameCount * 0.05) * 0.05;
        
        helicopter.dropTimer--;
        if (helicopter.dropTimer <= 0) {
            // Drop 2-3 nets
            const numDrops = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < numDrops; i++) {
                helicopter.drops.push({
                    lane: Math.floor(Math.random() * 3),
                    y: -30 - i * 100,
                });
            }
            helicopter.dropTimer = 240; // 4 seconds cooldown
            helicopter.targetLane = Math.floor(Math.random() * 3);
        }
        
        // Move drops
        for (let d of helicopter.drops) {
            d.y += gameSpeed;
            const dx = getLaneX(d.lane);
            if (Math.abs(player.x - dx) < 30 && Math.abs((player.y + player.jumpY) - d.y) < 30) {
                if (!player.turboActive) {
                    if (player.hasShield) {
                        player.hasShield = false;
                        document.getElementById('hudShield').style.display = 'none';
                        d.y = H() + 100;
                    } else {
                        sfxCrash();
                        gameOver("Hit by helicopter net! 🚁🥅");
                        return;
                    }
                }
            }
        }
        helicopter.drops = helicopter.drops.filter(d => d.y < H() + 100);
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
    
    // Power-up bar
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

// ---- Draw Game ----
function draw() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);
    
    const colors = getBiomeColors();
    const biome = getCurrentBiome();
    
    // -- Sky gradient --
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    skyGrad.addColorStop(0, colors.sky[0]);
    skyGrad.addColorStop(1, colors.sky[1]);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.5);
    
    // -- Horizon decorations --
    drawHorizon(w, h, biome);
    
    // -- Ground --
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, h * 0.4, w, h * 0.6);
    
    // -- Road (3 lanes) --
    const laneW = getLaneWidth();
    const totalW = laneW * 3;
    const roadX = (w - totalW) / 2;
    
    // Road surface
    ctx.fillStyle = colors.road;
    ctx.fillRect(roadX - 10, h * 0.35, totalW + 20, h * 0.65);
    
    // Perspective effect (road narrows towards horizon)
    ctx.save();
    ctx.beginPath();
    const vanishX = w / 2;
    const vanishY = h * 0.38;
    ctx.moveTo(roadX - 15, h);
    ctx.lineTo(vanishX - 30, vanishY);
    ctx.lineTo(vanishX + 30, vanishY);
    ctx.lineTo(roadX + totalW + 15, h);
    ctx.closePath();
    ctx.fillStyle = colors.road;
    ctx.fill();
    
    // Lane dividers
    ctx.strokeStyle = colors.roadLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 15]);
    for (let i = 1; i < 3; i++) {
        const x1 = roadX + laneW * i;
        const xTop = vanishX + (x1 - w/2) * 0.15;
        ctx.beginPath();
        ctx.moveTo(x1, h);
        ctx.lineTo(xTop, vanishY);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    
    // Road edges
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roadX - 10, h);
    ctx.lineTo(vanishX - 28, vanishY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(roadX + totalW + 10, h);
    ctx.lineTo(vanishX + 28, vanishY);
    ctx.stroke();
    ctx.restore();
    
    // -- Draw obstacles --
    for (let o of obstacles) {
        if (o.y < -100 || o.y > h + 50) continue;
        drawObstacle(o);
    }
    
    // -- Draw coins --
    for (let c of coins) {
        if (c.collected || c.y < -50 || c.y > h + 30) continue;
        drawCoin(c);
    }
    
    // -- Draw powerups --
    for (let p of powerups) {
        if (p.collected || p.y < -50 || p.y > h + 30) continue;
        drawPowerup(p);
    }
    
    // -- Draw Rover --
    if (rover.active) {
        drawRover();
    }
    
    // -- Draw Helicopter --
    if (helicopter.active) {
        drawHelicopter(w);
    }
    
    // -- Draw Farmer Joe's net --
    if (farmerJoe.netActive) {
        const netX = getLaneX(farmerJoe.netLane);
        ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
        ctx.beginPath();
        ctx.arc(netX, farmerJoe.netY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        // Draw net pattern
        for (let i = -12; i <= 12; i += 6) {
            ctx.beginPath();
            ctx.moveTo(netX + i, farmerJoe.netY - 15);
            ctx.lineTo(netX + i, farmerJoe.netY + 15);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(netX - 15, farmerJoe.netY + i);
            ctx.lineTo(netX + 15, farmerJoe.netY + i);
            ctx.stroke();
        }
    }
    
    // -- Draw Player (Moo Moo) --
    drawPlayer();
    
    // -- Draw Farmer Joe indicator --
    if (farmerJoe.active && farmerJoe.closeness > 10) {
        drawFarmerJoeIndicator();
    }
    
    // -- Draw particles --
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
        ctx.fillStyle = 'rgba(78, 192, 233, 0.1)';
        ctx.fillRect(0, 0, w, h);
        // Speed lines
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const sx = Math.random() * w;
            const sy = Math.random() * h * 0.5 + h * 0.3;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + (Math.random()-0.5)*20, sy + 40 + Math.random()*30);
            ctx.stroke();
        }
    }
    
    // -- Ambient overlay --
    ctx.fillStyle = colors.ambient;
    ctx.fillRect(0, 0, w, h);
}

function drawHorizon(w, h, biome) {
    const horizonY = h * 0.4;
    
    if (biome === 'barnyard') {
        // Barn
        ctx.fillStyle = COLORS.barnRed;
        ctx.fillRect(w * 0.1, horizonY - 60, 80, 60);
        ctx.fillStyle = '#8B0000';
        ctx.beginPath();
        ctx.moveTo(w * 0.1 - 5, horizonY - 60);
        ctx.lineTo(w * 0.1 + 40, horizonY - 90);
        ctx.lineTo(w * 0.1 + 85, horizonY - 60);
        ctx.fill();
        
        // Silo
        ctx.fillStyle = '#999';
        ctx.fillRect(w * 0.82, horizonY - 70, 30, 70);
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(w * 0.82 + 15, horizonY - 70, 15, Math.PI, 0);
        ctx.fill();
        
        // Trees
        for (let i = 0; i < 5; i++) {
            const tx = w * 0.25 + i * w * 0.13;
            ctx.fillStyle = '#2E7D32';
            ctx.beginPath();
            ctx.arc(tx, horizonY - 25, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(tx - 3, horizonY - 10, 6, 15);
        }
    } else if (biome === 'harvest') {
        // Windmill
        const wmx = w * 0.15;
        ctx.fillStyle = '#8D6E63';
        ctx.fillRect(wmx - 8, horizonY - 70, 16, 70);
        ctx.save();
        ctx.translate(wmx, horizonY - 70);
        ctx.rotate(frameCount * 0.02);
        ctx.fillStyle = '#A1887F';
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.fillRect(-3, 0, 6, 30);
        }
        ctx.restore();
        
        // Scarecrow
        ctx.fillStyle = '#8D6E63';
        ctx.fillRect(w * 0.75, horizonY - 45, 4, 45);
        ctx.fillRect(w * 0.75 - 15, horizonY - 35, 34, 4);
        ctx.fillStyle = COLORS.strawYellow;
        ctx.beginPath();
        ctx.arc(w * 0.75 + 2, horizonY - 50, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Corn stalks
        for (let i = 0; i < 8; i++) {
            const cx = w * 0.3 + i * w * 0.07;
            ctx.fillStyle = '#F9C846';
            ctx.fillRect(cx, horizonY - 15 - Math.random()*15, 3, 20);
        }
    } else {
        // Highway signs
        ctx.fillStyle = '#666';
        ctx.fillRect(w * 0.1, horizonY - 40, 4, 40);
        ctx.fillStyle = '#2E7D32';
        ctx.fillRect(w * 0.1 - 20, horizonY - 55, 48, 20);
        ctx.fillStyle = '#FFF';
        ctx.font = '8px sans-serif';
        ctx.fillText('EXIT', w * 0.1 - 10, horizonY - 42);
        
        // Guardrails
        ctx.fillStyle = '#999';
        for (let i = 0; i < 10; i++) {
            ctx.fillRect(w * 0.3 + i * 50, horizonY - 5, 30, 3);
        }
    }
}

function drawObstacle(o) {
    const x = o.x, y = o.y;
    
    ctx.save();
    switch(o.type) {
        case 'fence':
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(x - 25, y, 50, 6);
            ctx.fillRect(x - 25, y + 12, 50, 6);
            ctx.fillStyle = '#A0875A';
            ctx.fillRect(x - 22, y - 5, 5, 35);
            ctx.fillRect(x + 17, y - 5, 5, 35);
            ctx.fillRect(x - 2, y - 5, 5, 35);
            break;
            
        case 'haybale':
            ctx.fillStyle = '#DAA520';
            ctx.beginPath();
            ctx.ellipse(x, y + 15, 25, 18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#B8860B';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(x, y + 15, 25, 18, 0, 0, Math.PI * 2);
            ctx.stroke();
            // Hay texture
            ctx.strokeStyle = '#CD950C';
            for (let i = -18; i < 18; i += 6) {
                ctx.beginPath();
                ctx.moveTo(x + i, y + 5);
                ctx.lineTo(x + i, y + 28);
                ctx.stroke();
            }
            break;
            
        case 'barrier':
            ctx.fillStyle = '#D9383A';
            ctx.fillRect(x - 25, y, 50, 12);
            ctx.fillStyle = '#FFF';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(x - 22 + i * 14, y + 2, 8, 8);
            }
            // Posts
            ctx.fillStyle = '#888';
            ctx.fillRect(x - 22, y + 12, 5, 30);
            ctx.fillRect(x + 17, y + 12, 5, 30);
            break;
            
        case 'tractor':
            // Body
            ctx.fillStyle = '#D9383A';
            ctx.fillRect(x - 22, y, 44, 28);
            // Cab
            ctx.fillStyle = '#B71C1C';
            ctx.fillRect(x - 15, y - 15, 20, 18);
            // Window
            ctx.fillStyle = '#81D4FA';
            ctx.fillRect(x - 12, y - 12, 14, 10);
            // Wheels
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(x - 15, y + 30, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 15, y + 30, 14, 0, Math.PI * 2);
            ctx.fill();
            // Wheel hubs
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.arc(x - 15, y + 30, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 15, y + 30, 5, 0, Math.PI * 2);
            ctx.fill();
            break;
            
        case 'truck':
            // Container
            ctx.fillStyle = '#1565C0';
            ctx.fillRect(x - 25, y - 10, 50, 35);
            // Cab
            ctx.fillStyle = '#0D47A1';
            ctx.fillRect(x - 25, y + 25, 20, 20);
            // Windshield
            ctx.fillStyle = '#B3E5FC';
            ctx.fillRect(x - 22, y + 27, 14, 10);
            // Wheels
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.arc(x - 18, y + 48, 8, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 15, y + 48, 8, 0, Math.PI*2); ctx.fill();
            break;
            
        case 'mud':
            ctx.fillStyle = 'rgba(107, 66, 38, 0.7)';
            ctx.beginPath();
            ctx.ellipse(x, y + 8, 28, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            // Mud bubbles
            ctx.fillStyle = 'rgba(80, 50, 20, 0.5)';
            ctx.beginPath();
            ctx.arc(x - 8, y + 5, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 10, y + 10, 3, 0, Math.PI * 2);
            ctx.fill();
            break;
    }
    ctx.restore();
}

function drawCoin(c) {
    const glow = Math.sin(c.sparkle) * 0.3 + 0.7;
    ctx.save();
    ctx.globalAlpha = glow;
    
    // Glow
    ctx.fillStyle = 'rgba(249, 200, 70, 0.3)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.size + 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Coin body
    ctx.fillStyle = COLORS.strawYellow;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner circle
    ctx.strokeStyle = COLORS.cowbellGold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.size - 4, 0, Math.PI * 2);
    ctx.stroke();
    
    // $ sign
    ctx.fillStyle = COLORS.cowbellGold;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¢', c.x, c.y);
    
    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawPowerup(p) {
    const glow = Math.sin(p.glow * 2) * 5 + 8;
    ctx.save();
    
    // Glow ring
    ctx.strokeStyle = p.type === 'turbo' ? '#4EC0E9' : p.type === 'magnet' ? '#E8A923' : '#7CBC37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + glow, 0, Math.PI * 2);
    ctx.stroke();
    
    // Background
    ctx.fillStyle = p.type === 'turbo' ? 'rgba(78,192,233,0.5)' : p.type === 'magnet' ? 'rgba(232,169,35,0.5)' : 'rgba(124,188,55,0.5)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Icon
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
        p.type === 'turbo' ? '🥛' : p.type === 'magnet' ? '🧲' : '🛡️',
        p.x, p.y
    );
    
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
        ctx.beginPath();
        ctx.arc(0, -10, 40, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Shield bubble
    if (player.hasShield) {
        ctx.strokeStyle = 'rgba(78, 192, 233, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -10, 38, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    if (stumble) {
        ctx.rotate(Math.sin(frameCount * 0.5) * 0.1);
    }
    
    if (sliding) {
        // Sliding pose - cow is low
        ctx.translate(0, 20);
        ctx.scale(1.3, 0.5);
    }
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 20, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // -- Draw Moo Moo the cow --
    const bounce = player.jumping ? 0 : Math.sin(player.animFrame * Math.PI / 2) * 3;
    
    // Body
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.ellipse(0, -5 - bounce, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Patches (black spots)
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(-8, -12 - bounce, 8, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, 0 - bounce, 6, 5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-5, 5 - bounce, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Head
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(0, -28 - bounce, 14, 0, Math.PI * 2);
    ctx.fill();
    
    // Snout
    ctx.fillStyle = '#FFCCAA';
    ctx.beginPath();
    ctx.ellipse(0, -22 - bounce, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Nostrils
    ctx.fillStyle = '#D4956A';
    ctx.beginPath();
    ctx.arc(-3, -21 - bounce, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3, -21 - bounce, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-6, -32 - bounce, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -32 - bounce, 3, 0, Math.PI * 2);
    ctx.fill();
    // Eye highlights
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(-5, -33 - bounce, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, -33 - bounce, 1.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Ears
    ctx.fillStyle = '#EEE';
    ctx.beginPath();
    ctx.ellipse(-12, -36 - bounce, 6, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, -36 - bounce, 6, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Horns
    ctx.fillStyle = '#F5DEB3';
    ctx.beginPath();
    ctx.moveTo(-8, -40 - bounce);
    ctx.lineTo(-12, -50 - bounce);
    ctx.lineTo(-5, -42 - bounce);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, -40 - bounce);
    ctx.lineTo(12, -50 - bounce);
    ctx.lineTo(5, -42 - bounce);
    ctx.fill();
    
    // Bell collar
    ctx.fillStyle = '#D9383A';
    ctx.fillRect(-8, -16 - bounce, 16, 3);
    ctx.fillStyle = COLORS.cowbellGold;
    ctx.beginPath();
    ctx.arc(0, -12 - bounce, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Legs (animated)
    ctx.fillStyle = '#FFF';
    const legPhase = player.animFrame;
    const frontLeg = Math.sin(legPhase * Math.PI / 2) * 6;
    const backLeg = -frontLeg;
    // Front legs
    ctx.fillRect(-10, 12 - bounce, 5, 12 + frontLeg);
    ctx.fillRect(5, 12 - bounce, 5, 12 + backLeg);
    // Hooves
    ctx.fillStyle = '#333';
    ctx.fillRect(-11, 23 - bounce + frontLeg, 7, 3);
    ctx.fillRect(4, 23 - bounce + backLeg, 7, 3);
    
    // Tail
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 8 - bounce);
    ctx.quadraticCurveTo(18, 5 - bounce + Math.sin(frameCount*0.1)*5, 20, -5 - bounce);
    ctx.stroke();
    // Tail tuft
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(20, -5 - bounce, 3, 0, Math.PI*2);
    ctx.fill();
    
    // Skin overlay for shop skins
    if (activeSkin === 'golden') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.ellipse(0, -5 - bounce, 22, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    } else if (activeSkin === 'superhero') {
        // Cape
        ctx.fillStyle = '#D9383A';
        ctx.beginPath();
        ctx.moveTo(-8, -15 - bounce);
        ctx.lineTo(-15, 15 - bounce);
        ctx.lineTo(15, 15 - bounce);
        ctx.lineTo(8, -15 - bounce);
        ctx.fill();
    } else if (activeSkin === 'wizard') {
        // Wizard hat
        ctx.fillStyle = '#4A148C';
        ctx.beginPath();
        ctx.moveTo(0, -58 - bounce);
        ctx.lineTo(-14, -36 - bounce);
        ctx.lineTo(14, -36 - bounce);
        ctx.fill();
        ctx.fillStyle = COLORS.cowbellGold;
        ctx.beginPath();
        ctx.arc(0, -45 - bounce, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

function drawRover() {
    const rx = getLaneX(rover.lane);
    const ry = rover.leaping ? rover.y : H() * 0.5;
    
    ctx.save();
    ctx.translate(rx, ry);
    
    if (rover.warning) {
        // Warning exclamation
        ctx.fillStyle = COLORS.barnRed;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ 🐕', 0, -30 + Math.sin(frameCount * 0.2) * 5);
    }
    
    // Dog body
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Head
    ctx.fillStyle = '#A0522D';
    ctx.beginPath();
    ctx.arc(0, -16, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Ears
    ctx.fillStyle = '#6B3410';
    ctx.beginPath();
    ctx.ellipse(-8, -22, 5, 7, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, -22, 5, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(-4, -18, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -18, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-4, -18, 1.5, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -18, 1.5, 0, Math.PI*2);
    ctx.fill();
    
    // Nose
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, -12, 2.5, 0, Math.PI*2);
    ctx.fill();
    
    // Legs
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-12, 10, 4, 10);
    ctx.fillRect(8, 10, 4, 10);
    
    ctx.restore();
}

function drawHelicopter(w) {
    ctx.save();
    const hx = helicopter.x;
    const hy = H() * 0.15;
    
    // Spotlight
    ctx.fillStyle = `rgba(255, 255, 200, ${helicopter.spotlightOpacity})`;
    ctx.beginPath();
    ctx.moveTo(hx - 10, hy + 20);
    ctx.lineTo(hx - 50, H());
    ctx.lineTo(hx + 50, H());
    ctx.lineTo(hx + 10, hy + 20);
    ctx.fill();
    
    // Helicopter body
    ctx.fillStyle = '#37474F';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 30, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Tail
    ctx.fillStyle = '#455A64';
    ctx.fillRect(hx + 20, hy - 5, 30, 8);
    ctx.fillRect(hx + 45, hy - 15, 5, 18);
    
    // Windshield
    ctx.fillStyle = '#B3E5FC';
    ctx.beginPath();
    ctx.ellipse(hx - 10, hy - 2, 12, 8, 0, Math.PI, 0);
    ctx.fill();
    
    // Rotor (animated)
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const rotorAngle = frameCount * 0.3;
    ctx.moveTo(hx - Math.cos(rotorAngle) * 35, hy - 16);
    ctx.lineTo(hx + Math.cos(rotorAngle) * 35, hy - 16);
    ctx.stroke();
    
    // Rotor hub
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(hx, hy - 16, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw helicopter drops (nets)
    for (let d of helicopter.drops) {
        const dx = getLaneX(d.lane);
        ctx.fillStyle = 'rgba(100, 50, 0, 0.7)';
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(dx, d.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Net pattern
        ctx.strokeStyle = 'rgba(100, 70, 30, 0.6)';
        for (let i = -15; i <= 15; i += 5) {
            ctx.beginPath();
            ctx.moveTo(dx + i, d.y - 18);
            ctx.lineTo(dx + i, d.y + 18);
            ctx.stroke();
        }
        for (let i = -15; i <= 15; i += 5) {
            ctx.beginPath();
            ctx.moveTo(dx - 18, d.y + i);
            ctx.lineTo(dx + 18, d.y + i);
            ctx.stroke();
        }
    }
    
    ctx.restore();
}

function drawFarmerJoeIndicator() {
    const closeness = farmerJoe.closeness;
    const alpha = Math.min(closeness / 100, 0.8);
    const w = W(), h = H();
    
    // Red border warning
    ctx.fillStyle = `rgba(217, 56, 58, ${alpha * 0.3})`;
    ctx.fillRect(0, h - 80, w, 80);
    
    // Farmer icon and distance text
    ctx.fillStyle = `rgba(255,255,255, ${alpha})`;
    ctx.font = '14px Fredoka One, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`👨‍🌾 Farmer Joe is close! (${Math.floor(closeness)}%)`, w / 2, h - 40);
    
    // Danger bar
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(w/2 - 80, h - 25, 160, 10);
    ctx.fillStyle = closeness > 70 ? '#D9383A' : '#E8A923';
    ctx.fillRect(w/2 - 80, h - 25, 160 * (closeness/100), 10);
}

// ---- Kiki Tips ----
function showKikiTip(text) {
    currentTip = text;
    const tipEl = document.getElementById('kikiTip');
    const textEl = document.getElementById('kikiText');
    textEl.textContent = text;
    tipEl.style.display = 'flex';
    tipEl.style.animation = 'none';
    tipEl.offsetHeight; // reflow
    tipEl.style.animation = 'tipSlide 0.3s ease-out';
    
    setTimeout(() => {
        tipEl.style.display = 'none';
    }, 3000);
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
    
    // Calculate final stats
    const finalDist = Math.floor(distance);
    const finalCoins = coinsCollected;
    const finalScore = score;
    
    // Save coins
    totalCoins += finalCoins;
    
    // Check high score
    const isNewRecord = finalDist > highScore;
    if (isNewRecord) highScore = finalDist;
    
    saveData();
    
    // Update UI
    document.getElementById('gameOverCause').textContent = cause;
    document.getElementById('finalDistance').textContent = finalDist + 'm';
    document.getElementById('finalCoins').textContent = finalCoins;
    document.getElementById('finalScore').textContent = finalScore.toLocaleString();
    document.getElementById('newHighScore').style.display = isNewRecord ? 'block' : 'none';
    
    // Badges
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
    // Draw a nice static background
    drawMenuBackground();
}

function updateMenuUI() {
    document.getElementById('menuHighScore').textContent = highScore;
    document.getElementById('menuCoins').textContent = totalCoins;
}

function drawMenuBackground() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);
    
    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4EC0E9');
    grad.addColorStop(0.5, '#87CEEB');
    grad.addColorStop(0.7, '#7CBC37');
    grad.addColorStop(1, '#5a9a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    
    // Some clouds
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
    
    for (let item of shopItems) {
        const owned = ownedSkins.includes(item.id) || (item.id === 'multiplier2x' && scoreMultiplier >= 2) || (item.id === 'multiplier3x' && scoreMultiplier >= 3);
        const div = document.createElement('div');
        div.className = 'shop-item' + (owned ? ' owned' : '');
        div.innerHTML = `
            <span class="shop-item-icon">${item.icon}</span>
            <span class="shop-item-name">${item.name}</span>
            <span class="shop-item-price">${owned ? (item.type === 'skin' ? (activeSkin === item.id ? '✅ Equipped' : 'Owned') : '✅ Owned') : '🪙 ' + item.price}</span>
        `;
        
        div.addEventListener('click', () => {
            if (owned && item.type === 'skin') {
                // Equip
                activeSkin = item.id;
                saveData();
                openShop(); // refresh
                sfxClick();
            } else if (!owned && totalCoins >= item.price) {
                totalCoins -= item.price;
                if (item.type === 'skin') {
                    ownedSkins.push(item.id);
                    activeSkin = item.id;
                } else if (item.id === 'multiplier2x') {
                    scoreMultiplier = 2;
                } else if (item.id === 'multiplier3x') {
                    scoreMultiplier = 3;
                }
                saveData();
                sfxPowerup();
                openShop(); // refresh
            } else if (!owned) {
                sfxCrash();
            }
        });
        
        grid.appendChild(div);
    }
    
    // Default skin button
    const defaultDiv = document.createElement('div');
    defaultDiv.className = 'shop-item' + (activeSkin === 'default' ? ' owned' : '');
    defaultDiv.innerHTML = `
        <span class="shop-item-icon">🐄</span>
        <span class="shop-item-name">Classic Moo</span>
        <span class="shop-item-price">${activeSkin === 'default' ? '✅ Equipped' : 'Free'}</span>
    `;
    defaultDiv.addEventListener('click', () => {
        activeSkin = 'default';
        saveData();
        sfxClick();
        openShop();
    });
    grid.prepend(defaultDiv);
}

// ---- Event Listeners ----
document.getElementById('playBtn').addEventListener('click', () => { sfxClick(); startGame(); });
document.getElementById('shopBtn').addEventListener('click', openShop);
document.getElementById('dailyBtn').addEventListener('click', () => {
    sfxClick();
    // Daily challenge: start at higher speed
    startGame();
    gameSpeed = 10;
    distance = 500; // start from harvest fields
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
    if (soundEnabled && state === 'playing') startBGM();
    else stopBGM();
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
        draw(); // keep drawing but don't update
    }
}

// ---- Initialize ----
updateMenuUI();
drawMenuBackground();

// Touch to init audio
document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('click', initAudio, { once: true });

})();

