const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const fadeOverlay = document.getElementById('fade-overlay');
const menuScreen = document.getElementById('menu');
const transitionScreen = document.getElementById('transition-screen');
const levelTitleText = document.getElementById('level-title');

let width, height;
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- Constants & Physics ---
const TILE_SIZE = 40;
const GRAVITY = 1800;
const JUMP_FORCE = -700;
const MOVE_SPEED = 400;
const ACCEL = 3500;
const FRICTION = 0.85;
const MAX_FALL = 1200;
const WALL_SLIDE = 150;

// --- State Management ---
const STATE = { MENU: 0, TRANSITION: 1, PLAYING: 2 };
let currentState = STATE.MENU;
let currentLevelIndex = 0;
let lastTime = 0;

// --- Utility: Lerp ---
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

// --- Level Data ---
const LEVELS = [
    {
        name: "Awakening",
        grid: [
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "S......................E",
            "111111...........1111111"
        ]
    },
    {
        name: "Ascension",
        grid: [
            "........................",
            ".......................E",
            ".....................111",
            "........................",
            ".................11.....",
            "........................",
            ".............11.........",
            "........................",
            ".........11.............",
            "S.......................",
            "111....................."
        ]
    },
    {
        name: "Reflection",
        grid: [
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "....................11..",
            "....................11..",
            ".......11...........11..",
            ".......11...........11..",
            "S......11...........11.E",
            "111....11...........1111"
        ]
    },
    {
        name: "Leap of Faith",
        grid: [
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "S......................E",
            "11........111.........11"
        ]
    },
    {
        name: "The Zenith",
        grid: [
            "........................",
            "........................",
            ".......................E",
            "........................",
            "...................11...",
            "...............11.......",
            "...........11...........",
            ".......11...............",
            "........................",
            "S.......................",
            "1111...................."
        ]
    }
];

let mapGrid = [];
let mapRows = 0;
let mapCols = 0;
let finishRect = {x: 0, y: 0, w: 0, h: 0};

// --- Input ---
const keys = { left: false, right: false, up: false };
window.addEventListener('keydown', e => {
    if (currentState === STATE.MENU && e.code === 'Space') {
        startGame();
        return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
        if (!keys.up) {
            keys.up = true;
            if (currentState === STATE.PLAYING) player.jump();
        }
    }
});
window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') keys.up = false;
});

// --- Particles ---
let particles = [];
class Particle {
    constructor(x, y, vx, vy, life, size, color) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.size = size; this.color = color;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }
    draw(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
    }
}

function spawnParticles(x, y, count, speed, color, sizeBase = 3) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const vel = Math.random() * speed;
        particles.push(new Particle(
            x, y, Math.cos(angle)*vel, Math.sin(angle)*vel,
            0.5 + Math.random()*0.5, Math.random()*sizeBase + 1, color
        ));
    }
}

// --- Player (Wisp Cube) ---
class Player {
    constructor() {
        this.width = 24; this.height = 24;
        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.onGround = false;
        this.wallSliding = false;
        this.wallDir = 0;
        this.jumpsLeft = 1;
        
        // Aesthetics
        this.visualScaleX = 1;
        this.visualScaleY = 1;
        this.trailTimer = 0;
    }

    jump() {
        if (this.onGround) {
            this.vy = JUMP_FORCE;
            this.onGround = false;
            this.squash(0.6, 1.4);
            spawnParticles(this.x + this.width/2, this.y + this.height, 15, 100, 'rgb(167, 139, 250)');
        } else if (this.wallSliding) {
            this.vy = JUMP_FORCE * 0.9;
            this.vx = -this.wallDir * MOVE_SPEED * 1.2;
            this.wallSliding = false;
            this.jumpsLeft = 1;
            this.squash(0.6, 1.4);
            spawnParticles(this.x + this.width/2, this.y + this.height/2, 15, 100, 'rgb(56, 189, 248)');
        } else if (this.jumpsLeft > 0) {
            this.vy = JUMP_FORCE * 0.9;
            this.jumpsLeft--;
            this.squash(0.8, 1.2);
            spawnParticles(this.x + this.width/2, this.y + this.height, 20, 150, 'rgb(244, 63, 94)');
        }
    }

    squash(sx, sy) {
        this.visualScaleX = sx;
        this.visualScaleY = sy;
    }

    update(dt) {
        // Horizontal Movement
        if (keys.left) this.vx -= ACCEL * dt;
        if (keys.right) this.vx += ACCEL * dt;
        if (!keys.left && !keys.right) this.vx *= Math.pow(FRICTION, dt * 60);
        this.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, this.vx));

        this.x += this.vx * dt;
        this.handleCollision(true);

        // Vertical Movement
        this.vy += GRAVITY * dt;
        
        if (this.wallSliding && this.vy > 0) {
            this.vy = Math.min(this.vy, WALL_SLIDE);
            if (Math.random() < 0.2) {
                spawnParticles(
                    this.wallDir === 1 ? this.x + this.width : this.x, 
                    this.y + this.height, 
                    1, 30, 'rgb(56, 189, 248)', 2
                );
            }
        } else {
            this.vy = Math.min(this.vy, MAX_FALL);
        }

        this.y += this.vy * dt;
        const wasOnGround = this.onGround;
        this.onGround = false;
        this.handleCollision(false);

        // Landing Impact
        if (!wasOnGround && this.onGround) {
            this.squash(1.4, 0.6);
            this.jumpsLeft = 1;
            spawnParticles(this.x + this.width/2, this.y + this.height, 10, 80, 'rgb(167, 139, 250)');
        } else if (this.onGround) {
            this.jumpsLeft = 1;
        }

        // Out of bounds death
        if (this.y > mapRows * TILE_SIZE + 500) {
            die();
        }

        // Win check
        if (this.x < finishRect.x + finishRect.w && this.x + this.width > finishRect.x &&
            this.y < finishRect.y + finishRect.h && this.y + this.height > finishRect.y) {
            completeLevel();
        }

        // Aesthetics update
        this.visualScaleX = lerp(this.visualScaleX, 1, dt * 10);
        this.visualScaleY = lerp(this.visualScaleY, 1, dt * 10);

        // Passive Trail
        this.trailTimer -= dt;
        if (this.trailTimer <= 0) {
            spawnParticles(this.x + this.width/2, this.y + this.height/2, 1, 10, 'rgb(167, 139, 250)', 4);
            this.trailTimer = 0.05;
        }
    }

    handleCollision(isX) {
        const tiles = this.getCollidingTiles();
        this.wallSliding = false;
        this.wallDir = 0;

        for (const tile of tiles) {
            if (isX) {
                if (this.vx > 0) {
                    this.x = tile.x * TILE_SIZE - this.width;
                    this.vx = 0;
                    if (!this.onGround && keys.right) { this.wallSliding = true; this.wallDir = 1; }
                } else if (this.vx < 0) {
                    this.x = tile.x * TILE_SIZE + TILE_SIZE;
                    this.vx = 0;
                    if (!this.onGround && keys.left) { this.wallSliding = true; this.wallDir = -1; }
                }
            } else {
                if (this.vy > 0) {
                    this.y = tile.y * TILE_SIZE - this.height;
                    this.vy = 0;
                    this.onGround = true;
                } else if (this.vy < 0) {
                    this.y = tile.y * TILE_SIZE + TILE_SIZE;
                    this.vy = 0;
                }
            }
        }
    }

    getCollidingTiles() {
        let tiles = [];
        const startC = Math.floor(this.x / TILE_SIZE);
        const endC = Math.floor((this.x + this.width - 0.1) / TILE_SIZE);
        const startR = Math.floor(this.y / TILE_SIZE);
        const endR = Math.floor((this.y + this.height - 0.1) / TILE_SIZE);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                if (r >= 0 && r < mapRows && c >= 0 && c < mapCols) {
                    if (mapGrid[r][c] === '1') {
                        tiles.push({x: c, y: r});
                    }
                }
            }
        }
        return tiles;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height);
        ctx.scale(this.visualScaleX, this.visualScaleY);
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgb(167, 139, 250)';
        ctx.fillStyle = '#fff';
        
        // Draw centered on bottom for correct scaling
        ctx.fillRect(-this.width/2, -this.height, this.width, this.height);
        
        ctx.restore();
    }
}

// --- Camera ---
const camera = { x: 0, y: 0 };

// --- Globals ---
const player = new Player();
let startPos = {x: 0, y: 0};

// --- Game Flow ---
function buildLevel(index) {
    const level = LEVELS[index];
    mapRows = level.grid.length;
    mapCols = level.grid[0].length;
    mapGrid = [];

    for (let r = 0; r < mapRows; r++) {
        const row = [];
        for (let c = 0; c < mapCols; c++) {
            const char = level.grid[r][c];
            row.push(char);
            if (char === 'S') {
                startPos = { x: c * TILE_SIZE, y: r * TILE_SIZE };
            } else if (char === 'E') {
                finishRect = { x: c * TILE_SIZE, y: 0, w: TILE_SIZE, h: mapRows * TILE_SIZE };
            }
        }
        mapGrid.push(row);
    }
    
    player.x = startPos.x;
    player.y = startPos.y;
    player.vx = 0; player.vy = 0;
    camera.x = player.x - width/2;
    camera.y = player.y - height/2;
    particles = [];
}

function startGame() {
    menuScreen.classList.remove('active');
    currentLevelIndex = 0;
    fadeOverlay.classList.add('black');
    fadeOverlay.style.opacity = '1';
    
    setTimeout(() => {
        buildLevel(currentLevelIndex);
        fadeOverlay.style.opacity = '0';
        currentState = STATE.PLAYING;
    }, 800);
}

function completeLevel() {
    currentState = STATE.TRANSITION;
    currentLevelIndex++;
    
    fadeOverlay.style.opacity = '1';
    
    setTimeout(() => {
        if (currentLevelIndex >= LEVELS.length) {
            levelTitleText.innerText = "JOURNEY COMPLETE";
            transitionScreen.classList.add('active');
        } else {
            levelTitleText.innerText = LEVELS[currentLevelIndex].name;
            transitionScreen.classList.add('active');
            
            setTimeout(() => {
                buildLevel(currentLevelIndex);
                transitionScreen.classList.remove('active');
                fadeOverlay.style.opacity = '0';
                currentState = STATE.PLAYING;
            }, 2000);
        }
    }, 800);
}

function die() {
    currentState = STATE.TRANSITION;
    spawnParticles(player.x, player.y, 50, 200, 'rgb(167, 139, 250)');
    
    setTimeout(() => {
        fadeOverlay.classList.add('black');
        fadeOverlay.style.opacity = '1';
        setTimeout(() => {
            player.x = startPos.x;
            player.y = startPos.y;
            player.vx = 0; player.vy = 0;
            camera.x = player.x - width/2;
            camera.y = player.y - height/2;
            particles = [];
            
            fadeOverlay.style.opacity = '0';
            currentState = STATE.PLAYING;
        }, 800);
    }, 500);
}

// --- Render ---
function drawMap() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.2)';
    ctx.lineWidth = 1;

    for (let r = 0; r < mapRows; r++) {
        for (let c = 0; c < mapCols; c++) {
            if (mapGrid[r][c] === '1') {
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    // Finish Area (Glowing Green Beacon)
    ctx.shadowBlur = 40;
    ctx.shadowColor = 'rgb(16, 185, 129)';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.fillRect(finishRect.x, -2000, finishRect.w, 4000);
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(finishRect.x + finishRect.w/2 - 2, -2000, 4, 4000);
    ctx.shadowBlur = 0;
}

// --- Main Loop ---
function loop(timestamp) {
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.1; // clamp dt

    ctx.clearRect(0, 0, width, height);

    if (currentState === STATE.PLAYING) {
        player.update(dt);
        
        // Camera smooth follow
        const targetCamX = player.x - width/2 + player.width/2;
        const targetCamY = player.y - height/2 + player.height/2;
        camera.x = lerp(camera.x, targetCamX, dt * 5);
        camera.y = lerp(camera.y, targetCamY, dt * 5);
    }

    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => p.life > 0);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawMap();
    if (currentState !== STATE.TRANSITION || currentLevelIndex >= LEVELS.length) {
        player.draw(ctx);
    }
    
    ctx.globalCompositeOperation = 'lighter';
    particles.forEach(p => p.draw(ctx));
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
