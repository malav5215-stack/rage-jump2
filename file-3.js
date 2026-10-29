/**
 * ============================================================================
 * RAGE JUMP: Just One More Try — Complete Game Engine
 * ============================================================================
 * An indie-quality 2D precision rage platformer built in Vanilla JavaScript.
 * Features:
 *  - Responsive physics with sub-stepping, coyote time, and jump buffering
 *  - Head-bump collision blocking from below (no jumping through solid ceilings)
 *  - 5 handcrafted escalating levels + Procedural Daily Gauntlet
 *  - Moving platforms, rotating saws, crumbling blocks, bounce pads, falling traps
 *  - Pure Web Audio API synthesized sound effects (zero external audio files)
 *  - Particle systems, dynamic squash/stretch, screen shake, trail effects
 *  - Humorous death quips, personal best tracking, skin customization
 *  - Web Share API with clipboard fallback, mobile touch controls, full persistence
 * ============================================================================
 */

(function () {
  'use strict';

  // ============================================================================
  // 1. CONSTANTS & CONFIGURATION
  // ============================================================================
  const CONFIG = {
    // Virtual Canvas Resolution (Internal rendering resolution)
    CANVAS_WIDTH: 960,
    CANVAS_HEIGHT: 540,

    // Physics Constants (Units in pixels and seconds)
    GRAVITY: 1450,             // Gravity pulling downward
    RUN_SPEED: 290,            // Max horizontal running speed
    ACCEL_GROUND: 2200,        // Acceleration while touching ground
    ACCEL_AIR: 1600,           // Acceleration while airborne
    FRICTION_GROUND: 1900,     // Deceleration when no keys are pressed (ground)
    FRICTION_AIR: 400,         // Air drag deceleration
    JUMP_FORCE: -490,          // Initial jump velocity (negative = upward)
    JUMP_CUT_MULT: 0.52,       // Early jump release velocity multiplier
    MAX_FALL_SPEED: 780,       // Terminal falling velocity
    BOUNCE_PAD_FORCE: -720,    // Vertical launch velocity for bounce pads

    // Game Feel & Forgiveness
    COYOTE_TIME: 0.12,         // Window (seconds) to jump after leaving a ledge
    JUMP_BUFFER_TIME: 0.14,    // Window (seconds) to buffer a jump before landing
    RESPAWN_DELAY: 0.38,       // Time before respawn after death

    // Storage Key
    STORAGE_KEY: 'ragejump_save_v2'
  };

  // Humorous Rage Death Messages
  const DEATH_QUIPS = [
    "That jump looked easier in your head.",
    "Physics: 1, You: 0.",
    "Gravity remains completely undefeated.",
    "Have you tried pressing Jump a little earlier?",
    "The spikes were just hungry.",
    "Spikes: exists. You: target acquired.",
    "Pro tip: Pointy red triangles are sharp.",
    "Keyboard still in one piece? Good. Retry.",
    "Almost had it! (By 'almost', we mean not at all).",
    "Your reflexes are currently running on dial-up.",
    "Calculated... but man are you bad at math.",
    "Don't blink. Also, don't walk into saws.",
    "Nice landing! With your face.",
    "Rage is just passion leaving the body.",
    "Ctrl + Z does not work in platformers.",
    "The floor is literally instant death.",
    "One more try. You know you can't quit now.",
    "A majestic leap right into the abyss.",
    "Did you think that block was safe? Rookie mistake.",
    "Fun fact: Surviving is better than dying.",
    "That was totally lag. Definitely not your fault.",
    "Spike: 'Hello there, friend!'",
    "Deep breath. Center your chi. Try again.",
    "That was an interpretive dance of failure."
  ];

  // Character Cosmetic Skins
  const SKINS = [
    {
      id: 'cyan',
      name: 'Arcade Cyan',
      color: '#00f0ff',
      glow: 'rgba(0, 240, 255, 0.7)',
      eyeColor: '#ffffff',
      condition: 'Default Starter Hero',
      isUnlocked: () => true
    },
    {
      id: 'red',
      name: 'Rage Red',
      color: '#ff2a5f',
      glow: 'rgba(255, 42, 95, 0.8)',
      eyeColor: '#ffe5ec',
      condition: 'Die 25 times total',
      isUnlocked: (save) => save.totalDeaths >= 25
    },
    {
      id: 'green',
      name: 'Toxic Emerald',
      color: '#39ff14',
      glow: 'rgba(57, 255, 20, 0.75)',
      eyeColor: '#ffffff',
      condition: 'Conquer Level 2',
      isUnlocked: (save) => save.unlockedLevel >= 3
    },
    {
      id: 'pink',
      name: 'Synth Magenta',
      color: '#ff007f',
      glow: 'rgba(255, 0, 127, 0.8)',
      eyeColor: '#ffffff',
      condition: 'Clear any level with 0 deaths',
      isUnlocked: (save) => Object.values(save.levelRecords || {}).some(r => r.minDeaths === 0)
    },
    {
      id: 'gold',
      name: 'Golden God',
      color: '#ffea00',
      glow: 'rgba(255, 234, 0, 0.9)',
      eyeColor: '#000000',
      condition: 'Beat Level 4 with under 10 deaths',
      isUnlocked: (save) => save.levelRecords[4] && save.levelRecords[4].minDeaths < 10
    },
    {
      id: 'shadow',
      name: 'Phantom Void',
      color: '#a855f7',
      glow: 'rgba(168, 85, 247, 0.85)',
      eyeColor: '#00f0ff',
      condition: 'Defeat Level 5 (The Grand Gauntlet)',
      isUnlocked: (save) => save.levelRecords[5] !== undefined
    }
  ];

  // ============================================================================
  // 2. WEB AUDIO SYNTHESIZER (ZERO EXTERNAL ASSETS)
  // ============================================================================
  class SoundSynthesizer {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playJump() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
      } catch (e) {}
    }

    playLand() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {}
    }

    playHeadBump() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.06);
      } catch (e) {}
    }

    playDeath() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        // Low pitch crunchy explosion saw wave
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.28);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.28);
      } catch (e) {}
    }

    playCheckpoint() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const start = now + idx * 0.07;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.2, start);
          gain.gain.exponentialRampToValueAtTime(0.01, start + 0.15);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(start);
          osc.stop(start + 0.15);
        });
      } catch (e) {}
    }

    playBounce() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.18);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.18);
      } catch (e) {}
    }

    playCrumble() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.15);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
      } catch (e) {}
    }

    playWin() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const fanfare = [
          { f: 523.25, d: 0.1 },  // C5
          { f: 659.25, d: 0.1 },  // E5
          { f: 783.99, d: 0.12 }, // G5
          { f: 1046.5, d: 0.35 }  // C6
        ];
        let offset = 0;
        fanfare.forEach((n) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const start = now + offset;

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.f, start);

          gain.gain.setValueAtTime(0.25, start);
          gain.gain.exponentialRampToValueAtTime(0.01, start + n.d);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(start);
          osc.stop(start + n.d);
          offset += n.d * 0.9;
        });
      } catch (e) {}
    }
  }

  // ============================================================================
  // 3. STORAGE & STATE PERSISTENCE
  // ============================================================================
  class SaveManager {
    static load() {
      const defaultData = {
        unlockedLevel: 1,
        totalDeaths: 0,
        selectedSkin: 'cyan',
        levelRecords: {}, // { [levelNum]: { bestTime: 12.34, minDeaths: 2 } }
        dailyRecord: null, // { date: 'YYYY-MM-DD', bestTime: ..., minDeaths: ... }
        settings: {
          sound: true,
          shake: true,
          particles: true,
          touch: 'auto'
        }
      };

      try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!raw) return defaultData;
        const parsed = JSON.parse(raw);
        return Object.assign(defaultData, parsed, {
          settings: Object.assign(defaultData.settings, parsed.settings || {})
        });
      } catch (e) {
        return defaultData;
      }
    }

    static save(data) {
      try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
      } catch (e) {}
    }

    static reset() {
      try {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 4. PARTICLE ENGINE
  // ============================================================================
  class ParticleEngine {
    constructor() {
      this.particles = [];
      this.enabled = true;
    }

    spawn(x, y, color, count = 8, config = {}) {
      if (!this.enabled) return;
      for (let i = 0; i < count; i++) {
        const angle = config.angle !== undefined
          ? config.angle + (Math.random() - 0.5) * (config.spread || 0.8)
          : Math.random() * Math.PI * 2;
        const speed = (config.minSpeed || 40) + Math.random() * ((config.maxSpeed || 180) - (config.minSpeed || 40));

        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed + (config.vxBias || 0),
          vy: Math.sin(angle) * speed + (config.vyBias || 0),
          size: (config.minSize || 2.5) + Math.random() * ((config.maxSize || 5) - (config.minSize || 2.5)),
          color: color,
          alpha: 1,
          decay: (config.minDecay || 1.8) + Math.random() * ((config.maxDecay || 3.2) - (config.minDecay || 1.8)),
          gravity: config.gravity !== undefined ? config.gravity : 500,
          bounce: config.bounce || 0.4,
          shape: config.shape || 'square'
        });
      }
    }

    spawnDeathExplosion(x, y, skinColor) {
      this.spawn(x, y, skinColor, 22, {
        minSpeed: 100,
        maxSpeed: 380,
        minSize: 3,
        maxSize: 7,
        gravity: 800,
        bounce: 0.5,
        minDecay: 1.2,
        maxDecay: 2.2
      });
      // Additional crimson sparks for dramatic flair
      this.spawn(x, y, '#ff2a5f', 12, {
        minSpeed: 60,
        maxSpeed: 240,
        minSize: 2,
        maxSize: 4,
        gravity: 600,
        minDecay: 2.0,
        maxDecay: 3.5
      });
    }

    update(dt, platforms = []) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= p.decay * dt;

        // Simple bounce off solid platforms if enabled
        if (p.bounce > 0 && platforms.length > 0) {
          for (let j = 0; j < platforms.length; j++) {
            const plat = platforms[j];
            if (plat.type === 'solid' && p.x >= plat.x && p.x <= plat.x + plat.w && p.y >= plat.y && p.y <= plat.y + plat.h) {
              p.vy = -p.vy * p.bounce;
              p.vx *= 0.8;
              p.y = plat.y - p.size;
              break;
            }
          }
        }

        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    draw(ctx, camera) {
      if (this.particles.length === 0) return;
      ctx.save();
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const screenX = p.x - camera.x;
        const screenY = p.y - camera.y;

        // Culling particles outside screen viewport
        if (screenX < -20 || screenX > CONFIG.CANVAS_WIDTH + 20 ||
            screenY < -20 || screenY > CONFIG.CANVAS_HEIGHT + 20) {
          continue;
        }

        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(screenX, screenY, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(screenX - p.size / 2, screenY - p.size / 2, p.size, p.size);
        }
      }
      ctx.restore();
    }

    clear() {
      this.particles = [];
    }
  }

  // ============================================================================
  // 5. INPUT HANDLER (KEYBOARD + TOUCH + CLEAN FOCUS)
  // ============================================================================
  class InputHandler {
    constructor() {
      this.keys = {
        left: false,
        right: false,
        up: false,
        jump: false,
        restart: false,
        pause: false
      };

      // Jump pressed edge detection for buffering
      this.jumpPressedThisFrame = false;
      this.restartPressedThisFrame = false;
      this.pausePressedThisFrame = false;

      this.initKeyboard();
      this.initTouch();
      this.initFocusSafety();
    }

    initKeyboard() {
      window.addEventListener('keydown', (e) => {
        // Prevent browser page scrolling on Space and Arrow keys
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          e.preventDefault();
        }

        if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          this.keys.left = true;
        }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          this.keys.right = true;
        }
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
          if (!this.keys.jump) {
            this.jumpPressedThisFrame = true;
          }
          this.keys.jump = true;
        }
        if (e.code === 'KeyR') {
          if (!this.keys.restart) {
            this.restartPressedThisFrame = true;
          }
          this.keys.restart = true;
        }
        if (e.code === 'Escape') {
          if (!this.keys.pause) {
            this.pausePressedThisFrame = true;
          }
          this.keys.pause = true;
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          this.keys.left = false;
        }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          this.keys.right = false;
        }
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
          this.keys.jump = false;
        }
        if (e.code === 'KeyR') {
          this.keys.restart = false;
        }
        if (e.code === 'Escape') {
          this.keys.pause = false;
        }
      });
    }

    initTouch() {
      const btnLeft = document.getElementById('touchLeft');
      const btnRight = document.getElementById('touchRight');
      const btnJump = document.getElementById('touchJump');

      const bindTouch = (el, onDown, onUp) => {
        if (!el) return;
        const handleStart = (e) => {
          e.preventDefault();
          el.classList.add('pressed');
          onDown();
        };
        const handleEnd = (e) => {
          e.preventDefault();
          el.classList.remove('pressed');
          onUp();
        };

        el.addEventListener('touchstart', handleStart, { passive: false });
        el.addEventListener('touchend', handleEnd, { passive: false });
        el.addEventListener('touchcancel', handleEnd, { passive: false });
        el.addEventListener('mousedown', handleStart);
        el.addEventListener('mouseup', handleEnd);
        el.addEventListener('mouseleave', handleEnd);
      };

      bindTouch(btnLeft, () => { this.keys.left = true; }, () => { this.keys.left = false; });
      bindTouch(btnRight, () => { this.keys.right = true; }, () => { this.keys.right = false; });
      bindTouch(btnJump, () => {
        if (!this.keys.jump) this.jumpPressedThisFrame = true;
        this.keys.jump = true;
      }, () => {
        this.keys.jump = false;
      });
    }

    initFocusSafety() {
      // Clear key state when tab/window loses focus to prevent stuck movement keys
      window.addEventListener('blur', () => {
        this.keys.left = false;
        this.keys.right = false;
        this.keys.jump = false;
        this.keys.restart = false;
        this.keys.pause = false;
      });
    }

    endFrame() {
      this.jumpPressedThisFrame = false;
      this.restartPressedThisFrame = false;
      this.pausePressedThisFrame = false;
    }
  }

  // ============================================================================
  // 6. PLAYER ENTITY (PHYSICS, ANIMATION & SQUASH)
  // ============================================================================
  class Player {
    constructor(x, y) {
      this.width = 24;
      this.height = 26;
      this.reset(x, y);

      // Visual Animation States
      this.scaleX = 1;
      this.scaleY = 1;
      this.facing = 1; // 1 = right, -1 = left
      this.blinkTimer = 2.0;
      this.isBlinking = false;
      this.trailHistory = [];
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.isGrounded = false;
      this.wasGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.dead = false;
      this.standingOnPlatform = null; // Moving platform tracking
      this.trailHistory = [];
    }

    update(dt, input, level, particles, audio) {
      if (this.dead) return;

      // Handle Jump Buffering
      if (input.jumpPressedThisFrame) {
        this.jumpBufferTimer = CONFIG.JUMP_BUFFER_TIME;
      } else if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer -= dt;
      }

      // Handle Coyote Time
      if (this.isGrounded) {
        this.coyoteTimer = CONFIG.COYOTE_TIME;
      } else if (this.coyoteTimer > 0) {
        this.coyoteTimer -= dt;
      }

      // 1. Horizontal Input & Acceleration
      let moveDir = 0;
      if (input.keys.left) moveDir -= 1;
      if (input.keys.right) moveDir += 1;

      if (moveDir !== 0) {
        this.facing = moveDir;
        const accel = this.isGrounded ? CONFIG.ACCEL_GROUND : CONFIG.ACCEL_AIR;
        this.vx += moveDir * accel * dt;
        // Clamp to max speed
        if (Math.abs(this.vx) > CONFIG.RUN_SPEED) {
          this.vx = Math.sign(this.vx) * CONFIG.RUN_SPEED;
        }
      } else {
        // Friction deceleration
        const friction = this.isGrounded ? CONFIG.FRICTION_GROUND : CONFIG.FRICTION_AIR;
        if (Math.abs(this.vx) > 0) {
          const decel = friction * dt;
          if (Math.abs(this.vx) <= decel) {
            this.vx = 0;
          } else {
            this.vx -= Math.sign(this.vx) * decel;
          }
        }
      }

      // 2. Jump Execution (Buffered + Coyote)
      if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
        this.vy = CONFIG.JUMP_FORCE;
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.isGrounded = false;

        // Squash & stretch jump animation
        this.scaleX = 0.75;
        this.scaleY = 1.35;

        // Jump audio & dust
        audio.playJump();
        particles.spawn(this.x + this.width / 2, this.y + this.height, '#ffffff', 6, {
          minSpeed: 20,
          maxSpeed: 80,
          vyBias: -40,
          gravity: 200,
          minDecay: 3
        });
      }

      // 3. Variable Jump Height: Short hops on early release
      if (!input.keys.jump && this.vy < -120) {
        this.vy *= CONFIG.JUMP_CUT_MULT;
      }

      // 4. Gravity & Terminal Velocity
      this.vy += CONFIG.GRAVITY * dt;
      if (this.vy > CONFIG.MAX_FALL_SPEED) {
        this.vy = CONFIG.MAX_FALL_SPEED;
      }

      // 5. Carry by moving platform
      if (this.standingOnPlatform && this.standingOnPlatform.vx) {
        this.x += this.standingOnPlatform.vx * dt;
      }

      // 6. Sub-Stepped Collision Resolution (Prevents tunneling at high velocities)
      const subSteps = 3;
      const subDt = dt / subSteps;
      this.wasGrounded = this.isGrounded;
      this.isGrounded = false;
      this.standingOnPlatform = null;

      for (let step = 0; step < subSteps; step++) {
        // Resolve X movement
        this.x += this.vx * subDt;
        this.resolveCollisionX(level.platforms);

        // Resolve Y movement
        this.y += this.vy * subDt;
        this.resolveCollisionY(level.platforms, audio, particles);
      }

      // Landing detection
      if (!this.wasGrounded && this.isGrounded) {
        audio.playLand();
        this.scaleX = 1.35;
        this.scaleY = 0.7;
        particles.spawn(this.x + this.width / 2, this.y + this.height, '#ffffff', 5, {
          minSpeed: 20,
          maxSpeed: 70,
          angle: -Math.PI / 2,
          spread: Math.PI * 0.8,
          gravity: 300,
          minDecay: 3
        });
      }

      // Smooth visual recovery from squash & stretch
      this.scaleX += (1 - this.scaleX) * 12 * dt;
      this.scaleY += (1 - this.scaleY) * 12 * dt;

      // Trail history update
      if (Math.abs(this.vx) > 100 || Math.abs(this.vy) > 150) {
        this.trailHistory.push({ x: this.x, y: this.y, alpha: 0.45 });
        if (this.trailHistory.length > 5) this.trailHistory.shift();
      } else if (this.trailHistory.length > 0) {
        this.trailHistory.shift();
      }

      // Blinking animation logic
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.isBlinking = !this.isBlinking;
        this.blinkTimer = this.isBlinking ? 0.12 : (2.0 + Math.random() * 2.5);
      }

      // Level bounds check: falling into abyss
      if (this.y > level.bounds.height + 100) {
        this.dead = true;
      }
    }

    /**
     * Resolve X Axis Collisions with Solid Platforms
     */
    resolveCollisionX(platforms) {
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (p.type !== 'solid' && p.type !== 'crumble') continue;
        if (p.isBroken) continue; // Broken crumbling platform

        if (this.overlaps(p)) {
          if (this.vx > 0) {
            // Hit left wall of platform
            this.x = p.x - this.width;
            this.vx = 0;
          } else if (this.vx < 0) {
            // Hit right wall of platform
            this.x = p.x + p.w;
            this.vx = 0;
          }
        }
      }
    }

    /**
     * Resolve Y Axis Collisions with Solid Platforms
     * CRITICAL REQUIREMENT: Solid platforms block jumps from below!
     */
    resolveCollisionY(platforms, audio, particles) {
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (p.type !== 'solid' && p.type !== 'crumble') continue;
        if (p.isBroken) continue;

        if (this.overlaps(p)) {
          if (this.vy > 0) {
            // Landing on top of platform
            this.y = p.y - this.height;
            this.vy = 0;
            this.isGrounded = true;
            this.standingOnPlatform = p;

            // Trigger crumble block decay if stepped on
            if (p.type === 'crumble' && !p.isCrumbling) {
              p.isCrumbling = true;
              p.crumbleTimer = 0.42; // Crumble duration in seconds
              audio.playCrumble();
            }
          } else if (this.vy < 0) {
            // CRITICAL: Head hit bottom of solid platform!
            // Snap player top to platform bottom and zero velocity!
            this.y = p.y + p.h;
            this.vy = 0;
            audio.playHeadBump();

            // Head bonk sparks
            particles.spawn(this.x + this.width / 2, this.y, '#ffffff', 3, {
              minSpeed: 30,
              maxSpeed: 90,
              angle: Math.PI / 2,
              spread: 1.0,
              gravity: 400
            });
          }
        }
      }
    }

    overlaps(rect) {
      return (
        this.x < rect.x + rect.w &&
        this.x + this.width > rect.x &&
        this.y < rect.y + rect.h &&
        this.y + this.height > rect.y
      );
    }

    draw(ctx, camera, skin) {
      if (this.dead) return;

      const screenX = this.x - camera.x;
      const screenY = this.y - camera.y;

      // Draw faint motion trail
      for (let i = 0; i < this.trailHistory.length; i++) {
        const t = this.trailHistory[i];
        ctx.save();
        ctx.globalAlpha = t.alpha * 0.35;
        ctx.fillStyle = skin.color;
        ctx.fillRect(t.x - camera.x, t.y - camera.y, this.width, this.height);
        ctx.restore();
      }

      ctx.save();
      // Apply center-based squash and stretch transformation
      const centerX = screenX + this.width / 2;
      const centerY = screenY + this.height;
      ctx.translate(centerX, centerY);
      ctx.scale(this.scaleX, this.scaleY);

      // Character body glow
      ctx.shadowColor = skin.glow;
      ctx.shadowBlur = 12;
      ctx.fillStyle = skin.color;

      // Rounded rectangle body
      const w = this.width;
      const h = this.height;
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + r, -h);
      ctx.lineTo(w / 2 - r, -h);
      ctx.quadraticCurveTo(w / 2, -h, w / 2, -h + r);
      ctx.lineTo(w / 2, 0 - r);
      ctx.quadraticCurveTo(w / 2, 0, w / 2 - r, 0);
      ctx.lineTo(-w / 2 + r, 0);
      ctx.quadraticCurveTo(-w / 2, 0, -w / 2, 0 - r);
      ctx.lineTo(-w / 2, -h + r);
      ctx.quadraticCurveTo(-w / 2, -h, -w / 2 + r, -h);
      ctx.closePath();
      ctx.fill();

      // Clear shadow for facial details
      ctx.shadowBlur = 0;

      // Draw Hero Visor / Eyes
      if (!this.isBlinking) {
        ctx.fillStyle = skin.eyeColor;
        const eyeOffset = this.facing * 3;
        const eyeY = -h * 0.62;

        // Big expressive eyes
        ctx.fillRect(-w / 2 + 5 + eyeOffset, eyeY, 4, 6);
        ctx.fillRect(-w / 2 + 13 + eyeOffset, eyeY, 4, 6);

        // Eye pupils / reflections
        ctx.fillStyle = '#0c0f1d';
        ctx.fillRect(-w / 2 + 7 + eyeOffset, eyeY + 2, 2, 3);
        ctx.fillRect(-w / 2 + 15 + eyeOffset, eyeY + 2, 2, 3);
      } else {
        // Closed eye slits when blinking
        ctx.strokeStyle = skin.eyeColor;
        ctx.lineWidth = 1.5;
        const eyeY = -h * 0.58;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 4, eyeY);
        ctx.lineTo(-w / 2 + 9, eyeY);
        ctx.moveTo(-w / 2 + 12, eyeY);
        ctx.lineTo(-w / 2 + 17, eyeY);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // 7. CAMERA SYSTEM
  // ============================================================================
  class Camera {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.shakeIntensity = 0;
      this.shakeDuration = 0;
      this.shakeEnabled = true;
    }

    triggerShake(intensity = 12, duration = 0.28) {
      if (!this.shakeEnabled) return;
      this.shakeIntensity = intensity;
      this.shakeDuration = duration;
    }

    update(dt, player, levelBounds) {
      // Smooth lerp tracking with horizontal look-ahead
      const lookAhead = player.vx * 0.22;
      const targetX = player.x + player.width / 2 - CONFIG.CANVAS_WIDTH / 2 + lookAhead;
      const targetY = player.y + player.height / 2 - CONFIG.CANVAS_HEIGHT / 2 - 30;

      // Smooth camera interpolation
      const lerpFactor = 8.5 * dt;
      this.x += (targetX - this.x) * lerpFactor;
      this.y += (targetY - this.y) * lerpFactor;

      // Clamp camera within level bounds
      const minX = 0;
      const maxX = Math.max(0, levelBounds.width - CONFIG.CANVAS_WIDTH);
      const minY = 0;
      const maxY = Math.max(0, levelBounds.height - CONFIG.CANVAS_HEIGHT);

      this.x = Math.max(minX, Math.min(this.x, maxX));
      this.y = Math.max(minY, Math.min(this.y, maxY));

      // Handle screen shake decay and random offset
      if (this.shakeDuration > 0 && this.shakeEnabled) {
        this.shakeDuration -= dt;
        const decay = this.shakeDuration / 0.28;
        const currentIntensity = this.shakeIntensity * Math.max(0, decay);
        this.shakeX = (Math.random() - 0.5) * 2 * currentIntensity;
        this.shakeY = (Math.random() - 0.5) * 2 * currentIntensity;
      } else {
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }

    apply(ctx) {
      ctx.translate(-Math.floor(this.x + this.shakeX), -Math.floor(this.y + this.shakeY));
    }
  }

  // ============================================================================
  // 8. LEVEL DESIGN & HAZARDS
  // ============================================================================
  class LevelManager {
    static getLevel(num) {
      if (num === 'daily') {
        return LevelManager.generateDailyLevel();
      }

      switch (num) {
        case 1:
          return LevelManager.createLevel1();
        case 2:
          return LevelManager.createLevel2();
        case 3:
          return LevelManager.createLevel3();
        case 4:
          return LevelManager.createLevel4();
        case 5:
          return LevelManager.createLevel5();
        default:
          return LevelManager.createLevel1();
      }
    }

    /**
     * LEVEL 1: The Gentle Lie (Tutorial & Movement)
     * High ceilings, wide platforms, introductory hops, zero cheap tricks.
     */
    static createLevel1() {
      return {
        id: 1,
        name: "Level 1: The Gentle Lie",
        bounds: { width: 1700, height: 600 },
        spawn: { x: 80, y: 440 },
        checkpoint: { x: 780, y: 420, active: false },
        goal: { x: 1560, y: 380, w: 36, h: 60 },
        signposts: [
          { x: 140, y: 420, text: "A/D or Arrows to Move. SPACE to Jump!" },
          { x: 500, y: 400, text: "Hold Jump longer for higher leaps." },
          { x: 1000, y: 360, text: "Jump off edges with confidence (Coyote Time)!" },
          { x: 1420, y: 340, text: "Touch the Portal Flag to Clear!" }
        ],
        platforms: [
          // Safe ground start
          { x: 40, y: 480, w: 360, h: 120, type: 'solid' },
          // Gentle stepping platforms
          { x: 460, y: 450, w: 180, h: 30, type: 'solid' },
          { x: 720, y: 420, w: 220, h: 30, type: 'solid' }, // Checkpoint platform
          { x: 1020, y: 390, w: 160, h: 30, type: 'solid' },
          { x: 1260, y: 380, w: 140, h: 30, type: 'solid' },
          // Finish platform
          { x: 1480, y: 440, w: 200, h: 160, type: 'solid' }
        ],
        hazards: [
          // Gentle pits at the bottom
          { type: 'spike', x: 400, y: 580, w: 60, h: 20, dir: 'up' },
          { type: 'spike', x: 640, y: 580, w: 80, h: 20, dir: 'up' },
          { type: 'spike', x: 940, y: 580, w: 80, h: 20, dir: 'up' }
        ],
        movers: [],
        fallingSpikes: [],
        bouncePads: []
      };
    }

    /**
     * LEVEL 2: Pointy Regrets (Precision & Spikes)
     * Introduces floor spikes, narrow pillars, and ceiling hazard clearances.
     */
    static createLevel2() {
      return {
        id: 2,
        name: "Level 2: Pointy Regrets",
        bounds: { width: 1900, height: 600 },
        spawn: { x: 70, y: 440 },
        checkpoint: { x: 920, y: 370, active: false },
        goal: { x: 1780, y: 320, w: 36, h: 60 },
        signposts: [
          { x: 140, y: 400, text: "Red Spikes = Instant Death. Don't touch tips or sides!" },
          { x: 920, y: 320, text: "CHECKPOINT! Deaths respawn right here." }
        ],
        platforms: [
          // Starting base
          { x: 40, y: 480, w: 200, h: 120, type: 'solid' },
          // Precision pillars
          { x: 300, y: 440, w: 70, h: 160, type: 'solid' },
          { x: 440, y: 410, w: 70, h: 190, type: 'solid' },
          { x: 580, y: 380, w: 80, h: 220, type: 'solid' },
          // Ceiling obstruction requiring controlled short hops
          { x: 720, y: 220, w: 130, h: 40, type: 'solid' },
          { x: 720, y: 420, w: 130, h: 180, type: 'solid' },
          // Checkpoint island
          { x: 900, y: 410, w: 180, h: 190, type: 'solid' },
          // Long leap over spike bed
          { x: 1160, y: 420, w: 70, h: 180, type: 'solid' },
          { x: 1310, y: 380, w: 60, h: 220, type: 'solid' },
          { x: 1450, y: 350, w: 70, h: 250, type: 'solid' },
          { x: 1600, y: 380, w: 80, h: 220, type: 'solid' },
          // Goal platform
          { x: 1740, y: 380, w: 140, h: 220, type: 'solid' }
        ],
        hazards: [
          // Floor spike beds between pillars
          { type: 'spike', x: 240, y: 580, w: 60, h: 20, dir: 'up' },
          { type: 'spike', x: 370, y: 580, w: 70, h: 20, dir: 'up' },
          { type: 'spike', x: 510, y: 580, w: 70, h: 20, dir: 'up' },
          { type: 'spike', x: 660, y: 580, w: 60, h: 20, dir: 'up' },
          // Spikes on the underside of ceiling
          { type: 'spike', x: 730, y: 260, w: 110, h: 18, dir: 'down' },
          // Spikes directly on platform edge
          { type: 'spike', x: 1040, y: 392, w: 40, h: 18, dir: 'up' },
          { type: 'spike', x: 1080, y: 580, w: 660, h: 20, dir: 'up' }
        ],
        movers: [],
        fallingSpikes: [],
        bouncePads: []
      };
    }

    /**
     * LEVEL 3: Tick Tock Panic (Moving Platforms & Saws)
     * Oscillating platforms, rotating buzzsaws on patrol, timing jumps.
     */
    static createLevel3() {
      return {
        id: 3,
        name: "Level 3: Tick Tock Panic",
        bounds: { width: 2100, height: 600 },
        spawn: { x: 70, y: 440 },
        checkpoint: { x: 1050, y: 340, active: false },
        goal: { x: 1980, y: 360, w: 36, h: 60 },
        signposts: [
          { x: 120, y: 390, text: "Moving platforms will carry your momentum!" },
          { x: 1050, y: 290, text: "Buzzsaws rotate continuously. Watch their rhythm!" }
        ],
        platforms: [
          // Start platform
          { x: 40, y: 480, w: 180, h: 120, type: 'solid' },
          // Mid rest island
          { x: 650, y: 430, w: 110, h: 40, type: 'solid' },
          // Checkpoint sanctuary
          { x: 1000, y: 390, w: 180, h: 50, type: 'solid' },
          // Narrow perch
          { x: 1540, y: 410, w: 80, h: 40, type: 'solid' },
          // Goal base
          { x: 1920, y: 420, w: 160, h: 180, type: 'solid' }
        ],
        movers: [
          // Horizontal moving platform 1
          { x: 260, y: 450, w: 90, h: 22, type: 'solid', startX: 250, endX: 520, speed: 110, vx: 110, currentX: 250, dir: 1 },
          // Vertical moving platform 2
          { x: 830, y: 440, w: 85, h: 22, type: 'solid', startY: 260, endY: 460, speed: 90, vy: -90, currentY: 440, dir: -1 },
          // Fast horizontal mover
          { x: 1250, y: 390, w: 90, h: 22, type: 'solid', startX: 1240, endX: 1470, speed: 135, vx: 135, currentX: 1240, dir: 1 },
          // Long horizontal elevator toward goal
          { x: 1670, y: 420, w: 90, h: 22, type: 'solid', startX: 1660, endX: 1870, speed: 120, vx: 120, currentX: 1660, dir: 1 }
        ],
        hazards: [
          // Huge spike abyss below
          { type: 'spike', x: 200, y: 580, w: 1720, h: 20, dir: 'up' },
          // Rotating Buzzsaws (Circular patrol hazards)
          { type: 'saw', x: 420, y: 340, radius: 24, startX: 340, endX: 500, speed: 120, currentX: 420, dir: 1, angle: 0 },
          { type: 'saw', x: 1360, y: 300, radius: 26, startX: 1280, endX: 1450, speed: 140, currentX: 1360, dir: -1, angle: 0 },
          { type: 'saw', x: 1770, y: 330, radius: 26, startY: 240, endY: 370, speed: 100, currentY: 330, dir: 1, angle: 0 }
        ],
        fallingSpikes: [],
        bouncePads: []
      };
    }

    /**
     * LEVEL 4: Trust Issues (Crumble & Surprise Traps)
     * Crumbling blocks, deceptive fake floor, surprise dropping ceiling spikes, bounce pads.
     */
    static createLevel4() {
      return {
        id: 4,
        name: "Level 4: Trust Issues",
        bounds: { width: 2200, height: 600 },
        spawn: { x: 70, y: 440 },
        checkpoint: { x: 1080, y: 330, active: false },
        goal: { x: 2060, y: 260, w: 36, h: 60 },
        signposts: [
          { x: 120, y: 390, text: "Orange blocks crumble under your feet. Don't linger!" },
          { x: 620, y: 350, text: "Watch the ceiling. Some spikes are impatient." },
          { x: 1550, y: 380, text: "Cyan Launch Pads boost you sky-high!" }
        ],
        platforms: [
          // Start platform
          { x: 40, y: 480, w: 160, h: 120, type: 'solid' },
          // Crumbling staircase
          { x: 250, y: 450, w: 60, h: 22, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          { x: 360, y: 420, w: 60, h: 22, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          { x: 470, y: 390, w: 60, h: 22, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          // Safe solid ledge under trap
          { x: 590, y: 410, w: 140, h: 40, type: 'solid' },
          // Deceptive fake platform (Looks solid, but player drops right through!)
          { x: 790, y: 410, w: 100, h: 30, type: 'fake' },
          // Lower catch platform
          { x: 800, y: 490, w: 90, h: 30, type: 'solid' },
          // Checkpoint haven
          { x: 1040, y: 380, w: 160, h: 50, type: 'solid' },
          // Crumble path
          { x: 1260, y: 380, w: 60, h: 22, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          { x: 1380, y: 380, w: 60, h: 22, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          // Bounce pad foundation
          { x: 1520, y: 440, w: 120, h: 80, type: 'solid' },
          // High floating platform reached by bounce
          { x: 1720, y: 240, w: 100, h: 30, type: 'solid' },
          // Crumbling leap to finish
          { x: 1890, y: 250, w: 60, h: 22, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          // Finish area
          { x: 2000, y: 320, w: 160, h: 280, type: 'solid' }
        ],
        hazards: [
          // Spike abyss
          { type: 'spike', x: 180, y: 580, w: 1820, h: 20, dir: 'up' },
          // Ceiling spikes
          { type: 'spike', x: 620, y: 180, w: 90, h: 18, dir: 'down' }
        ],
        fallingSpikes: [
          // Ceiling trap: Drops when player passes underneath!
          { x: 640, y: 200, w: 24, h: 24, vy: 0, triggered: false, startY: 200, triggerX: 620, triggerW: 100 }
        ],
        bouncePads: [
          // Launch pad that flings player high up
          { x: 1560, y: 432, w: 40, h: 8 }
        ],
        movers: []
      };
    }

    /**
     * LEVEL 5: The Gauntlet of Despair (Final Master Challenge)
     * All mechanics combined: moving buzzsaws, crumbling bridges, bounce pads, and precision timing.
     */
    static createLevel5() {
      return {
        id: 5,
        name: "Level 5: The Gauntlet of Despair",
        bounds: { width: 2500, height: 600 },
        spawn: { x: 70, y: 440 },
        checkpoint: { x: 1200, y: 340, active: false },
        goal: { x: 2360, y: 220, w: 36, h: 60 },
        signposts: [
          { x: 120, y: 380, text: "THIS IS THE FINAL TEST. DO NOT BLINK." },
          { x: 1200, y: 280, text: "Halfway there. The worst is yet to come." }
        ],
        platforms: [
          // Start platform
          { x: 40, y: 480, w: 160, h: 120, type: 'solid' },
          // Step 1: Narrow stepping blocks over spikes
          { x: 250, y: 440, w: 45, h: 160, type: 'solid' },
          { x: 360, y: 400, w: 45, h: 200, type: 'solid' },
          { x: 480, y: 360, w: 45, h: 240, type: 'solid' },
          // Step 2: Crumbling bridge over saw
          { x: 600, y: 360, w: 50, h: 20, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          { x: 700, y: 360, w: 50, h: 20, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          { x: 800, y: 360, w: 50, h: 20, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          // Safe haven before moving saw section
          { x: 920, y: 390, w: 90, h: 210, type: 'solid' },
          // Checkpoint Island
          { x: 1160, y: 390, w: 140, h: 50, type: 'solid' },
          // Bounce pad platform
          { x: 1440, y: 440, w: 80, h: 160, type: 'solid' },
          // High floating ledge
          { x: 1620, y: 240, w: 70, h: 30, type: 'solid' },
          // Narrow crumble ledge
          { x: 1780, y: 260, w: 50, h: 20, type: 'crumble', isCrumbling: false, crumbleTimer: 0, isBroken: false, respawnTimer: 0 },
          // Pre-goal ledge
          { x: 2120, y: 280, w: 60, h: 320, type: 'solid' },
          // Goal fortress
          { x: 2300, y: 280, w: 180, h: 320, type: 'solid' }
        ],
        movers: [
          // Moving platform over gauntlet abyss
          { x: 1040, y: 420, w: 80, h: 20, type: 'solid', startX: 1020, endX: 1130, speed: 110, vx: 110, currentX: 1020, dir: 1 },
          // Moving platform across final saw gap
          { x: 1910, y: 280, w: 80, h: 20, type: 'solid', startX: 1900, endX: 2070, speed: 130, vx: 130, currentX: 1900, dir: 1 }
        ],
        hazards: [
          // Floor spike bed
          { type: 'spike', x: 180, y: 580, w: 2140, h: 20, dir: 'up' },
          // Buzzsaws patrol
          { type: 'saw', x: 700, y: 420, radius: 26, startX: 620, endX: 780, speed: 140, currentX: 700, dir: 1, angle: 0 },
          { type: 'saw', x: 1530, y: 310, radius: 28, startY: 220, endY: 380, speed: 120, currentY: 310, dir: 1, angle: 0 },
          { type: 'saw', x: 1980, y: 220, radius: 28, startX: 1920, endX: 2060, speed: 160, currentX: 1980, dir: 1, angle: 0 },
          // Ceiling spikes
          { type: 'spike', x: 1620, y: 120, w: 80, h: 18, dir: 'down' }
        ],
        fallingSpikes: [
          { x: 950, y: 160, w: 24, h: 24, vy: 0, triggered: false, startY: 160, triggerX: 920, triggerW: 90 }
        ],
        bouncePads: [
          { x: 1460, y: 432, w: 40, h: 8 }
        ]
      };
    }

    /**
     * PROCEDURAL DAILY CHALLENGE GENERATOR
     * Uses a deterministic Linear Congruential Generator (LCG) seeded by the current date string (YYYY-MM-DD).
     * Every player worldwide plays the exact same seeded gauntlet each day!
     */
    static generateDailyLevel() {
      const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      let seed = 0;
      for (let i = 0; i < today.length; i++) {
        seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
      }

      // Pseudo-Random Number Generator (0 to 1)
      const rng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const level = {
        id: 'daily',
        name: `Daily Gauntlet: ${today}`,
        bounds: { width: 2200, height: 600 },
        spawn: { x: 70, y: 440 },
        checkpoint: { x: 1100, y: 340, active: false },
        goal: { x: 2080, y: 320, w: 36, h: 60 },
        signposts: [
          { x: 120, y: 390, text: `DAILY GAUNTLET [${today}]. Global Seed Active.` }
        ],
        platforms: [
          { x: 40, y: 480, w: 160, h: 120, type: 'solid' },
          { x: 1050, y: 380, w: 140, h: 40, type: 'solid' },
          { x: 2020, y: 380, w: 160, h: 220, type: 'solid' }
        ],
        movers: [],
        hazards: [
          { type: 'spike', x: 180, y: 580, w: 1850, h: 20, dir: 'up' }
        ],
        fallingSpikes: [],
        bouncePads: []
      };

      // Generate Room 1 (Start to Checkpoint)
      let curX = 240;
      let curY = 440;
      while (curX < 980) {
        const gap = 90 + rng() * 80;
        const width = 50 + rng() * 40;
        curY = Math.max(300, Math.min(460, curY + (rng() - 0.5) * 80));
        const isCrumble = rng() > 0.65;

        level.platforms.push({
          x: curX,
          y: curY,
          w: width,
          h: 22,
          type: isCrumble ? 'crumble' : 'solid',
          isCrumbling: false,
          crumbleTimer: 0,
          isBroken: false,
          respawnTimer: 0
        });

        // Chance to spawn saw above gap
        if (rng() > 0.7 && curX > 350) {
          level.hazards.push({
            type: 'saw',
            x: curX + width / 2,
            y: curY - 70,
            radius: 22,
            startX: curX - 40,
            endX: curX + width + 40,
            speed: 100 + rng() * 60,
            currentX: curX,
            dir: 1,
            angle: 0
          });
        }

        curX += width + gap;
      }

      // Generate Room 2 (Checkpoint to Goal)
      curX = 1240;
      curY = 380;
      while (curX < 1960) {
        const choice = rng();
        const width = 60 + rng() * 40;
        curY = Math.max(260, Math.min(460, curY + (rng() - 0.5) * 100));

        if (choice < 0.45) {
          // Solid block
          level.platforms.push({ x: curX, y: curY, w: width, h: 22, type: 'solid' });
        } else if (choice < 0.75) {
          // Moving platform
          level.movers.push({
            x: curX,
            y: curY,
            w: 75,
            h: 20,
            type: 'solid',
            startX: curX - 30,
            endX: curX + 110,
            speed: 110,
            vx: 110,
            currentX: curX,
            dir: 1
          });
        } else {
          // Bounce pad
          level.platforms.push({ x: curX, y: curY + 40, w: 70, h: 30, type: 'solid' });
          level.bouncePads.push({ x: curX + 15, y: curY + 32, w: 40, h: 8 });
        }

        curX += width + 100;
      }

      return level;
    }
  }

  // ============================================================================
  // 9. MAIN GAME CONTROLLER & STATE MACHINE
  // ============================================================================
  class GameController {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');

      // Subsystems
      this.audio = new SoundSynthesizer();
      this.input = new InputHandler();
      this.particles = new ParticleEngine();
      this.camera = new Camera();
      this.saveData = SaveManager.load();

      // Game States: 'MENU', 'PLAYING', 'PAUSED', 'LEVEL_CLEAR', 'VICTORY'
      this.state = 'MENU';
      this.currentLevelNum = 1;
      this.level = null;
      this.player = new Player(0, 0);

      // Level Stats
      this.levelDeaths = 0;
      this.levelTimer = 0;
      this.levelActive = false;
      this.checkpointReached = false;
      this.respawnTimer = 0;

      // DOM Elements Cache
      this.cacheDOMElements();
      this.applySavedSettings();
      this.bindUIEvents();
      this.initCharacterPreview();

      // Main Loop Timing
      this.lastTime = performance.now();
      requestAnimationFrame(this.gameLoop.bind(this));
    }

    cacheDOMElements() {
      this.ui = {
        hud: document.getElementById('gameHUD'),
        hudLevelName: document.getElementById('hudLevelName'),
        hudDeaths: document.getElementById('hudDeaths'),
        hudTimer: document.getElementById('hudTimer'),
        hudBestTime: document.getElementById('hudBestTime'),
        btnSoundToggle: document.getElementById('btnSoundToggle'),
        btnQuickRestart: document.getElementById('btnQuickRestart'),
        btnPause: document.getElementById('btnPause'),
        deathQuipBanner: document.getElementById('deathQuipBanner'),
        deathQuipText: document.getElementById('deathQuipText'),
        mobileControls: document.getElementById('mobileControls'),
        toast: document.getElementById('toastNotification'),
        toastIcon: document.getElementById('toastIcon'),
        toastMessage: document.getElementById('toastMessage'),

        // Screens
        titleScreen: document.getElementById('titleScreen'),
        levelSelectModal: document.getElementById('levelSelectModal'),
        dailyChallengeModal: document.getElementById('dailyChallengeModal'),
        skinsModal: document.getElementById('skinsModal'),
        pauseModal: document.getElementById('pauseModal'),
        levelCompleteModal: document.getElementById('levelCompleteModal'),
        victoryModal: document.getElementById('victoryModal'),
        settingsModal: document.getElementById('settingsModal'),
        helpModal: document.getElementById('helpModal'),

        // Buttons
        btnPlayGame: document.getElementById('btnPlayGame'),
        btnLevelSelect: document.getElementById('btnLevelSelect'),
        btnDailyChallenge: document.getElementById('btnDailyChallenge'),
        btnSettings: document.getElementById('btnSettings'),
        btnHelp: document.getElementById('btnHelp'),
        btnOpenSkins: document.getElementById('btnOpenSkins'),
        btnResume: document.getElementById('btnResume'),
        btnPauseRestart: document.getElementById('btnPauseRestart'),
        btnPauseSettings: document.getElementById('btnPauseSettings'),
        btnQuitToMenu: document.getElementById('btnQuitToMenu'),
        btnNextLevel: document.getElementById('btnNextLevel'),
        btnReplayLevel: document.getElementById('btnReplayLevel'),
        btnShareLevel: document.getElementById('btnShareLevel'),
        btnClearQuitMenu: document.getElementById('btnClearQuitMenu'),
        btnShareVictory: document.getElementById('btnShareVictory'),
        btnVictoryLevelSelect: document.getElementById('btnVictoryLevelSelect'),
        btnVictoryMainMenu: document.getElementById('btnVictoryMainMenu'),
        btnStartDaily: document.getElementById('btnStartDaily'),
        btnResetData: document.getElementById('btnResetData'),

        // Settings Controls
        settingSound: document.getElementById('settingSound'),
        settingShake: document.getElementById('settingShake'),
        settingParticles: document.getElementById('settingParticles'),
        settingTouch: document.getElementById('settingTouch'),

        // Text Displays
        menuTotalDeaths: document.getElementById('menuTotalDeaths'),
        menuLevelsCleared: document.getElementById('menuLevelsCleared'),
        currentSkinName: document.getElementById('currentSkinName'),
        levelGrid: document.getElementById('levelGridContainer'),
        skinsGrid: document.getElementById('skinsGridContainer')
      };
    }

    applySavedSettings() {
      const s = this.saveData.settings;
      this.audio.enabled = s.sound;
      this.camera.shakeEnabled = s.shake;
      this.particles.enabled = s.particles;

      if (this.ui.settingSound) this.ui.settingSound.checked = s.sound;
      if (this.ui.settingShake) this.ui.settingShake.checked = s.shake;
      if (this.ui.settingParticles) this.ui.settingParticles.checked = s.particles;
      if (this.ui.settingTouch) this.ui.settingTouch.value = s.touch;

      this.updateTouchControlsVisibility();
      this.updateMenuStats();
    }

    updateTouchControlsVisibility() {
      const mode = this.saveData.settings.touch;
      const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

      if (mode === 'always' || (mode === 'auto' && isTouchDevice)) {
        if (this.state === 'PLAYING') {
          this.ui.mobileControls.classList.remove('hidden');
        }
      } else {
        this.ui.mobileControls.classList.add('hidden');
      }
    }

    bindUIEvents() {
      // First user interaction initializes Web Audio context
      window.addEventListener('pointerdown', () => this.audio.init(), { once: true });
      window.addEventListener('keydown', () => this.audio.init(), { once: true });

      // Title Screen Buttons
      this.ui.btnPlayGame.addEventListener('click', () => {
        this.audio.init();
        this.loadLevel(this.saveData.unlockedLevel || 1);
      });

      this.ui.btnLevelSelect.addEventListener('click', () => this.openLevelSelect());
      this.ui.btnDailyChallenge.addEventListener('click', () => this.openDailyChallenge());
      this.ui.btnOpenSkins.addEventListener('click', () => this.openSkinsModal());
      this.ui.btnSettings.addEventListener('click', () => this.openModal('settingsModal'));
      this.ui.btnHelp.addEventListener('click', () => this.openModal('helpModal'));

      // In-Game HUD Buttons
      this.ui.btnSoundToggle.addEventListener('click', () => this.toggleSound());
      this.ui.btnQuickRestart.addEventListener('click', () => this.restartLevel());
      this.ui.btnPause.addEventListener('click', () => this.togglePause());

      // Pause Screen Buttons
      this.ui.btnResume.addEventListener('click', () => this.resumeGame());
      this.ui.btnPauseRestart.addEventListener('click', () => {
        this.closeAllModals();
        this.restartLevel();
      });
      this.ui.btnPauseSettings.addEventListener('click', () => this.openModal('settingsModal'));
      this.ui.btnQuitToMenu.addEventListener('click', () => this.quitToMainMenu());

      // Level Clear Screen Buttons
      this.ui.btnNextLevel.addEventListener('click', () => {
        this.closeAllModals();
        if (this.currentLevelNum < 5) {
          this.loadLevel(this.currentLevelNum + 1);
        } else {
          this.showVictoryScreen();
        }
      });
      this.ui.btnReplayLevel.addEventListener('click', () => {
        this.closeAllModals();
        this.restartLevel();
      });
      this.ui.btnShareLevel.addEventListener('click', () => this.shareLevelScore());
      this.ui.btnClearQuitMenu.addEventListener('click', () => this.quitToMainMenu());

      // Victory Screen Buttons
      this.ui.btnShareVictory.addEventListener('click', () => this.shareVictoryScore());
      this.ui.btnVictoryLevelSelect.addEventListener('click', () => {
        this.closeAllModals();
        this.openLevelSelect();
      });
      this.ui.btnVictoryMainMenu.addEventListener('click', () => this.quitToMainMenu());

      // Daily Challenge Start
      this.ui.btnStartDaily.addEventListener('click', () => {
        this.closeAllModals();
        this.loadLevel('daily');
      });

      // Close modal triggers
      document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-target');
          if (target) document.getElementById(target).classList.add('hidden');
        });
      });

      // Settings Change Listeners
      this.ui.settingSound.addEventListener('change', (e) => {
        this.saveData.settings.sound = e.target.checked;
        this.audio.enabled = e.target.checked;
        this.ui.btnSoundToggle.textContent = e.target.checked ? '🔊' : '🔇';
        SaveManager.save(this.saveData);
      });

      this.ui.settingShake.addEventListener('change', (e) => {
        this.saveData.settings.shake = e.target.checked;
        this.camera.shakeEnabled = e.target.checked;
        SaveManager.save(this.saveData);
      });

      this.ui.settingParticles.addEventListener('change', (e) => {
        this.saveData.settings.particles = e.target.checked;
        this.particles.enabled = e.target.checked;
        SaveManager.save(this.saveData);
      });

      this.ui.settingTouch.addEventListener('change', (e) => {
        this.saveData.settings.touch = e.target.value;
        SaveManager.save(this.saveData);
        this.updateTouchControlsVisibility();
      });

      // Reset All Data
      this.ui.btnResetData.addEventListener('click', () => {
        if (confirm("Reset ALL records, level unlocks, and stats? This cannot be undone.")) {
          SaveManager.reset();
          this.saveData = SaveManager.load();
          this.applySavedSettings();
          this.showToast("Save data has been reset.", "🗑️");
          this.closeAllModals();
        }
      });
    }

    openModal(modalId) {
      document.getElementById(modalId).classList.remove('hidden');
    }

    closeAllModals() {
      const modals = document.querySelectorAll('.screen-overlay');
      modals.forEach(m => m.classList.add('hidden'));
    }

    toggleSound() {
      this.audio.init();
      const next = !this.audio.enabled;
      this.audio.enabled = next;
      this.saveData.settings.sound = next;
      this.ui.settingSound.checked = next;
      this.ui.btnSoundToggle.textContent = next ? '🔊' : '🔇';
      SaveManager.save(this.saveData);
      this.showToast(next ? "Sound Enabled" : "Sound Muted", next ? "🔊" : "🔇");
    }

    updateMenuStats() {
      this.ui.menuTotalDeaths.textContent = this.saveData.totalDeaths;
      const cleared = Object.keys(this.saveData.levelRecords || {}).filter(k => k !== 'daily').length;
      this.ui.menuLevelsCleared.textContent = `${cleared}/5`;

      const currentSkin = SKINS.find(s => s.id === this.saveData.selectedSkin) || SKINS[0];
      this.ui.currentSkinName.textContent = currentSkin.name;
    }

    // ==========================================================================
    // LEVEL LOADING & RETRY LOOP
    // ==========================================================================
    loadLevel(levelNum) {
      this.currentLevelNum = levelNum;
      this.level = LevelManager.getLevel(levelNum);
      this.levelDeaths = 0;
      this.levelTimer = 0;
      this.checkpointReached = false;
      this.respawnTimer = 0;
      this.levelActive = true;
      this.state = 'PLAYING';

      // Reset Player to Spawn
      this.player.reset(this.level.spawn.x, this.level.spawn.y);
      this.particles.clear();

      // UI HUD Updates
      this.ui.hudLevelName.textContent = this.level.name;
      this.ui.hudDeaths.textContent = '0';
      this.ui.hudTimer.textContent = '00:00.0';

      const record = this.saveData.levelRecords[levelNum];
      if (record && record.bestTime !== undefined) {
        this.ui.hudBestTime.textContent = this.formatTime(record.bestTime);
      } else {
        this.ui.hudBestTime.textContent = '--:--.-';
      }

      this.closeAllModals();
      this.ui.hud.classList.remove('hidden');
      this.ui.deathQuipBanner.classList.add('hidden');
      this.updateTouchControlsVisibility();
    }

    restartLevel() {
      if (!this.level) return;
      this.levelDeaths++;
      this.saveData.totalDeaths++;
      SaveManager.save(this.saveData);

      this.ui.hudDeaths.textContent = this.levelDeaths;

      // Respawn at checkpoint or spawn
      const respawnPoint = (this.checkpointReached && this.level.checkpoint)
        ? this.level.checkpoint
        : this.level.spawn;

      this.player.reset(respawnPoint.x, respawnPoint.y);
      this.respawnTimer = 0;
      this.particles.clear();
      this.ui.deathQuipBanner.classList.add('hidden');
    }

    handlePlayerDeath() {
      if (this.player.dead) return;
      this.player.dead = true;
      this.levelDeaths++;
      this.saveData.totalDeaths++;
      SaveManager.save(this.saveData);

      this.ui.hudDeaths.textContent = this.levelDeaths;

      // Audio & Visual Effects
      this.audio.playDeath();
      this.camera.triggerShake(14, 0.3);

      const skin = this.getCurrentSkin();
      this.particles.spawnDeathExplosion(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height / 2,
        skin.color
      );

      // Show humorous rage quip
      this.showRandomDeathQuip();

      // Fast retry loop: respawn after delay
      this.respawnTimer = CONFIG.RESPAWN_DELAY;
    }

    showRandomDeathQuip() {
      const quip = DEATH_QUIPS[Math.floor(Math.random() * DEATH_QUIPS.length)];
      this.ui.deathQuipText.textContent = quip;
      this.ui.deathQuipBanner.classList.remove('hidden');
    }

    // ==========================================================================
    // LEVEL COMPLETION & VICTORY
    // ==========================================================================
    handleLevelComplete() {
      if (this.state !== 'PLAYING') return;
      this.state = 'LEVEL_CLEAR';
      this.audio.playWin();

      const timeSec = this.levelTimer;
      const deaths = this.levelDeaths;
      const lvlId = this.currentLevelNum;

      // Check / Update Personal Best
      if (!this.saveData.levelRecords[lvlId]) {
        this.saveData.levelRecords[lvlId] = { bestTime: timeSec, minDeaths: deaths };
      } else {
        const rec = this.saveData.levelRecords[lvlId];
        if (timeSec < rec.bestTime) rec.bestTime = timeSec;
        if (deaths < rec.minDeaths) rec.minDeaths = deaths;
      }

      // Unlock next level
      if (typeof lvlId === 'number' && lvlId >= this.saveData.unlockedLevel && lvlId < 5) {
        this.saveData.unlockedLevel = lvlId + 1;
      }

      SaveManager.save(this.saveData);

      // Update Level Clear Modal UI
      document.getElementById('clearTimeValue').textContent = this.formatTime(timeSec);
      document.getElementById('clearDeathsValue').textContent = deaths;
      document.getElementById('clearTimePB').textContent = `Best: ${this.formatTime(this.saveData.levelRecords[lvlId].bestTime)}`;
      document.getElementById('clearDeathsPB').textContent = `Fewest Deaths: ${this.saveData.levelRecords[lvlId].minDeaths}`;

      if (this.currentLevelNum === 5) {
        this.ui.btnNextLevel.textContent = "🏆 VIEW GRAND VICTORY";
      } else if (this.currentLevelNum === 'daily') {
        this.ui.btnNextLevel.textContent = "RETURN TO MENU";
      } else {
        this.ui.btnNextLevel.textContent = "NEXT LEVEL ▶";
      }

      this.openModal('levelCompleteModal');
    }

    showVictoryScreen() {
      this.state = 'VICTORY';
      this.closeAllModals();

      // Calculate Total Run Time & Deaths across all 5 levels
      let totalTime = 0;
      let totalLevelDeaths = 0;
      for (let i = 1; i <= 5; i++) {
        const r = this.saveData.levelRecords[i];
        if (r) {
          totalTime += r.bestTime || 0;
          totalLevelDeaths += r.minDeaths || 0;
        }
      }

      // Determine Rage Rank
      let rank = "SALT MINER";
      if (totalLevelDeaths < 15) rank = "ZEN MONK (GODLIKE)";
      else if (totalLevelDeaths < 40) rank = "PLATFORMING MASTER";
      else if (totalLevelDeaths < 80) rank = "SEASONED JUMPER";
      else rank = "KEYBOARD DESTROYER";

      document.getElementById('victoryTotalTime').textContent = this.formatTime(totalTime);
      document.getElementById('victoryTotalDeaths').textContent = totalLevelDeaths;
      document.getElementById('victoryRank').textContent = rank;

      this.openModal('victoryModal');
    }

    // ==========================================================================
    // SHARING (WEB SHARE API + CLIPBOARD FALLBACK)
    // ==========================================================================
    shareLevelScore() {
      const timeStr = this.formatTime(this.levelTimer);
      const deaths = this.levelDeaths;
      const levelTitle = this.level.name;
      const shareUrl = window.location.href.split('#')[0];

      const text = `🔥 I just beat ${levelTitle} in RAGE JUMP in ${timeStr} with ${deaths} deaths! Think you can do better? 🎮 Play free: ${shareUrl}`;

      this.executeShare("RAGE JUMP Challenge", text, shareUrl);
    }

    shareVictoryScore() {
      const deaths = this.saveData.totalDeaths;
      const shareUrl = window.location.href.split('#')[0];
      const text = `👑 I CONQUERED ALL 5 LEVELS in RAGE JUMP with ${deaths} total rage deaths! 🎮 Can you beat my score? Play free: ${shareUrl}`;

      this.executeShare("I Beat RAGE JUMP!", text, shareUrl);
    }

    executeShare(title, text, url) {
      if (navigator.share) {
        navigator.share({ title, text, url }).catch(() => {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          this.showToast("Score copied to clipboard! Ready to paste & brag.", "📋");
        }).catch(() => {
          this.fallbackPromptShare(text);
        });
      } else {
        this.fallbackPromptShare(text);
      }
    }

    fallbackPromptShare(text) {
      prompt("Copy your share message below:", text);
    }

    showToast(message, icon = "✨") {
      this.ui.toastIcon.textContent = icon;
      this.ui.toastMessage.textContent = message;
      this.ui.toast.classList.remove('hidden');

      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        this.ui.toast.classList.add('hidden');
      }, 3200);
    }

    // ==========================================================================
    // PAUSE & MENU TRANSITIONS
    // ==========================================================================
    togglePause() {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED';
        this.openModal('pauseModal');
      } else if (this.state === 'PAUSED') {
        this.resumeGame();
      }
    }

    resumeGame() {
      if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        this.closeAllModals();
      }
    }

    quitToMainMenu() {
      this.state = 'MENU';
      this.closeAllModals();
      this.ui.hud.classList.add('hidden');
      this.ui.mobileControls.classList.add('hidden');
      this.ui.titleScreen.classList.remove('hidden');
      this.updateMenuStats();
    }

    // ==========================================================================
    // MODALS: LEVEL SELECT & SKINS
    // ==========================================================================
    openLevelSelect() {
      this.ui.levelGrid.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const isUnlocked = i <= this.saveData.unlockedLevel;
        const rec = this.saveData.levelRecords[i];

        const card = document.createElement('div');
        card.className = `level-card ${isUnlocked ? '' : 'locked'}`;

        let pbText = 'Not cleared yet';
        let stars = '';
        if (rec) {
          pbText = `Best: ${this.formatTime(rec.bestTime)} (💀 ${rec.minDeaths})`;
          stars = rec.minDeaths === 0 ? '⭐⭐⭐' : (rec.minDeaths < 10 ? '⭐⭐' : '⭐');
        }

        card.innerHTML = `
          <span class="level-num">LEVEL 0${i}</span>
          <span class="level-name">${isUnlocked ? LevelManager.getLevel(i).name.split(': ')[1] : 'Locked'}</span>
          <span class="level-pb">${isUnlocked ? pbText : 'Beat prior level'}</span>
          <span class="level-stars">${stars}</span>
        `;

        if (isUnlocked) {
          card.addEventListener('click', () => {
            this.closeAllModals();
            this.loadLevel(i);
          });
        }

        this.ui.levelGrid.appendChild(card);
      }

      this.openModal('levelSelectModal');
    }

    openDailyChallenge() {
      const today = new Date().toISOString().slice(0, 10);
      document.getElementById('dailyDateBadge').textContent = `TODAY'S SEED: ${today}`;

      const rec = this.saveData.levelRecords['daily'];
      if (rec) {
        document.getElementById('dailyBestTime').textContent = this.formatTime(rec.bestTime);
        document.getElementById('dailyBestDeaths').textContent = rec.minDeaths;
        document.getElementById('dailyStatus').textContent = 'Conquered! 👑';
      } else {
        document.getElementById('dailyBestTime').textContent = '--:--.-';
        document.getElementById('dailyBestDeaths').textContent = '--';
        document.getElementById('dailyStatus').textContent = 'Unconquered';
      }

      this.openModal('dailyChallengeModal');
    }

    openSkinsModal() {
      this.ui.skinsGrid.innerHTML = '';

      SKINS.forEach(skin => {
        const unlocked = skin.isUnlocked(this.saveData);
        const isSelected = this.saveData.selectedSkin === skin.id;

        const card = document.createElement('div');
        card.className = `skin-card ${isSelected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`;

        card.innerHTML = `
          <div class="skin-swatch" style="background-color: ${skin.color}; box-shadow: 0 0 12px ${skin.glow};">
            ${isSelected ? '✓' : (unlocked ? '' : '🔒')}
          </div>
          <span class="skin-card-title">${skin.name}</span>
          <span class="skin-condition">${skin.condition}</span>
          ${unlocked ? `<button class="btn-secondary small equip-btn">${isSelected ? 'Equipped' : 'Equip'}</button>` : ''}
        `;

        if (unlocked) {
          card.addEventListener('click', () => {
            this.saveData.selectedSkin = skin.id;
            SaveManager.save(this.saveData);
            this.updateMenuStats();
            this.openSkinsModal(); // Re-render selected state
            this.showToast(`Equipped ${skin.name}`, "🎨");
          });
        }

        this.ui.skinsGrid.appendChild(card);
      });

      this.openModal('skinsModal');
    }

    getCurrentSkin() {
      return SKINS.find(s => s.id === this.saveData.selectedSkin) || SKINS[0];
    }

    initCharacterPreview() {
      const pCanvas = document.getElementById('charPreviewCanvas');
      if (!pCanvas) return;
      const pCtx = pCanvas.getContext('2d');

      const renderPreview = () => {
        pCtx.clearRect(0, 0, 96, 96);
        const skin = this.getCurrentSkin();
        const time = performance.now() * 0.003;
        const bounce = Math.sin(time) * 3;

        pCtx.save();
        pCtx.translate(48, 62 + bounce);
        pCtx.shadowColor = skin.glow;
        pCtx.shadowBlur = 10;
        pCtx.fillStyle = skin.color;
        pCtx.fillRect(-18, -36, 36, 36);

        // Eyes
        pCtx.shadowBlur = 0;
        pCtx.fillStyle = skin.eyeColor;
        pCtx.fillRect(-10, -26, 6, 9);
        pCtx.fillRect(4, -26, 6, 9);
        pCtx.fillStyle = '#0c0f1d';
        pCtx.fillRect(-7, -23, 3, 4);
        pCtx.fillRect(7, -23, 3, 4);

        pCtx.restore();
        requestAnimationFrame(renderPreview);
      };

      requestAnimationFrame(renderPreview);
    }

    formatTime(sec) {
      if (sec === undefined || sec === null || isNaN(sec)) return '--:--.-';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec * 10) % 10);
      return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
    }

    // ==========================================================================
    // 10. GAME LOOP: UPDATE & RENDER
    // ==========================================================================
    gameLoop(now) {
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;

      // Cap delta time to prevent spiraling after background tab sleep
      const dt = Math.min(rawDt, 0.05);

      this.update(dt);
      this.render();

      this.input.endFrame();
      requestAnimationFrame(this.gameLoop.bind(this));
    }

    update(dt) {
      // Global hotkeys
      if (this.input.pausePressedThisFrame) {
        this.togglePause();
      }
      if (this.input.restartPressedThisFrame && this.state === 'PLAYING') {
        this.restartLevel();
      }

      if (this.state !== 'PLAYING') return;

      // Update Level Elapsed Time
      this.levelTimer += dt;
      this.ui.hudTimer.textContent = this.formatTime(this.levelTimer);

      // Handle Respawn Countdown
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          const respawnPoint = (this.checkpointReached && this.level.checkpoint)
            ? this.level.checkpoint
            : this.level.spawn;
          this.player.reset(respawnPoint.x, respawnPoint.y);
          this.ui.deathQuipBanner.classList.add('hidden');
        }
      }

      // 1. Update Player
      this.player.update(dt, this.input, this.level, this.particles, this.audio);

      // 2. Update Moving Platforms
      if (this.level.movers) {
        for (let i = 0; i < this.level.movers.length; i++) {
          const m = this.level.movers[i];
          if (m.startX !== undefined) {
            // Horizontal mover
            m.currentX += m.speed * m.dir * dt;
            if (m.currentX >= m.endX) {
              m.currentX = m.endX;
              m.dir = -1;
            } else if (m.currentX <= m.startX) {
              m.currentX = m.startX;
              m.dir = 1;
            }
            m.x = m.currentX;
            m.vx = m.speed * m.dir;
          } else if (m.startY !== undefined) {
            // Vertical mover
            m.currentY += m.speed * m.dir * dt;
            if (m.currentY >= m.endY) {
              m.currentY = m.endY;
              m.dir = -1;
            } else if (m.currentY <= m.startY) {
              m.currentY = m.startY;
              m.dir = 1;
            }
            m.y = m.currentY;
            m.vy = m.speed * m.dir;
          }
        }
      }

      // 3. Update Crumbling Platforms
      for (let i = 0; i < this.level.platforms.length; i++) {
        const p = this.level.platforms[i];
        if (p.type === 'crumble') {
          if (p.isCrumbling && !p.isBroken) {
            p.crumbleTimer -= dt;
            // Crumble shake vibration
            p.shakeOffset = (Math.random() - 0.5) * 4;
            if (p.crumbleTimer <= 0) {
              p.isBroken = true;
              p.isCrumbling = false;
              p.respawnTimer = 2.4; // Seconds until platform respawns

              // Rubble explosion particles
              this.particles.spawn(p.x + p.w / 2, p.y + p.h / 2, '#ff9900', 10, {
                minSpeed: 40,
                maxSpeed: 140,
                gravity: 700,
                minDecay: 2
              });
            }
          } else if (p.isBroken) {
            p.respawnTimer -= dt;
            if (p.respawnTimer <= 0) {
              p.isBroken = false;
              p.shakeOffset = 0;
            }
          }
        }
      }

      // 4. Update Hazards & Saws
      for (let i = 0; i < this.level.hazards.length; i++) {
        const h = this.level.hazards[i];
        if (h.type === 'saw') {
          h.angle += 8 * dt; // Rotate teeth visual

          if (h.startX !== undefined) {
            h.currentX += h.speed * h.dir * dt;
            if (h.currentX >= h.endX) { h.currentX = h.endX; h.dir = -1; }
            else if (h.currentX <= h.startX) { h.currentX = h.startX; h.dir = 1; }
            h.x = h.currentX;
          } else if (h.startY !== undefined) {
            h.currentY += h.speed * h.dir * dt;
            if (h.currentY >= h.endY) { h.currentY = h.endY; h.dir = -1; }
            else if (h.currentY <= h.startY) { h.currentY = h.startY; h.dir = 1; }
            h.y = h.currentY;
          }

          // Saw circle vs Player AABB collision check
          if (!this.player.dead && this.checkCircleBoxCollision(h.x, h.y, h.radius - 3, this.player)) {
            this.handlePlayerDeath();
          }
        } else if (h.type === 'spike') {
          // Precise spike collision check (shrunk by 2px for fairness)
          if (!this.player.dead && this.checkSpikeCollision(h, this.player)) {
            this.handlePlayerDeath();
          }
        }
      }

      // 5. Update Falling Ceiling Spike Traps
      if (this.level.fallingSpikes) {
        for (let i = 0; i < this.level.fallingSpikes.length; i++) {
          const trap = this.level.fallingSpikes[i];
          if (!trap.triggered) {
            // Trigger trap when player passes underneath
            if (this.player.x + this.player.width > trap.triggerX &&
                this.player.x < trap.triggerX + trap.triggerW) {
              trap.triggered = true;
              trap.vy = 50;
            }
          } else {
            // Accelerate downward
            trap.vy += 1200 * dt;
            trap.y += trap.vy * dt;

            // Spike vs player collision
            if (!this.player.dead && this.player.overlaps({ x: trap.x + 3, y: trap.y + 3, w: trap.w - 6, h: trap.h - 6 })) {
              this.handlePlayerDeath();
            }

            // Stop at floor
            if (trap.y > this.level.bounds.height - 40) {
              trap.vy = 0;
            }
          }
        }
      }

      // 6. Update Bounce Pads
      if (this.level.bouncePads) {
        for (let i = 0; i < this.level.bouncePads.length; i++) {
          const pad = this.level.bouncePads[i];
          if (!this.player.dead && this.player.overlaps(pad) && this.player.vy >= 0) {
            this.player.vy = CONFIG.BOUNCE_PAD_FORCE;
            this.player.isGrounded = false;
            this.player.scaleX = 0.65;
            this.player.scaleY = 1.45;
            this.audio.playBounce();

            this.particles.spawn(pad.x + pad.w / 2, pad.y, '#00f0ff', 10, {
              minSpeed: 40,
              maxSpeed: 140,
              angle: -Math.PI / 2,
              spread: 0.8,
              gravity: 200
            });
          }
        }
      }

      // 7. Check Checkpoint Collision
      if (this.level.checkpoint && !this.checkpointReached) {
        const cp = this.level.checkpoint;
        const cpBox = { x: cp.x - 10, y: cp.y - 40, w: 30, h: 50 };
        if (this.player.overlaps(cpBox)) {
          this.checkpointReached = true;
          this.audio.playCheckpoint();
          this.showToast("CHECKPOINT REACHED!", "🚩");

          this.particles.spawn(cp.x, cp.y - 20, '#39ff14', 16, {
            minSpeed: 50,
            maxSpeed: 160,
            gravity: 200,
            minDecay: 2.0
          });
        }
      }

      // 8. Check Goal / Flag Victory Collision
      if (this.level.goal && !this.player.dead) {
        if (this.player.overlaps(this.level.goal)) {
          this.handleLevelComplete();
        }
      }

      // 9. Update Particles & Camera
      this.particles.update(dt, this.level.platforms);
      this.camera.update(dt, this.player, this.level.bounds);
    }

    checkSpikeCollision(spike, player) {
      // Shrunk hitbox to make deaths 100% fair
      const padding = 3;
      const spikeBox = {
        x: spike.x + padding,
        y: spike.y + padding,
        w: spike.w - padding * 2,
        h: spike.h - padding * 2
      };
      return player.overlaps(spikeBox);
    }

    checkCircleBoxCollision(cx, cy, radius, box) {
      const nearestX = Math.max(box.x, Math.min(cx, box.x + box.width));
      const nearestY = Math.max(box.y, Math.min(cy, box.y + box.height));
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      return (dx * dx + dy * dy) < (radius * radius);
    }

    render() {
      // Clear Screen
      this.ctx.fillStyle = '#090b14';
      this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

      if (this.state === 'MENU') return;

      this.ctx.save();
      this.camera.apply(this.ctx);

      // Render Parallax Background Grid
      this.renderWorldGrid();

      // Render Level Signposts / Instructions
      this.renderSignposts();

      // Render Platforms (Solid, Crumble, Fake)
      this.renderPlatforms();

      // Render Moving Platforms
      this.renderMovers();

      // Render Hazards (Spikes & Rotating Saws)
      this.renderHazards();

      // Render Falling Spike Traps
      this.renderFallingSpikes();

      // Render Bounce Pads
      this.renderBouncePads();

      // Render Checkpoint Pole & Flag
      this.renderCheckpoint();

      // Render Goal Flag / Portal
      this.renderGoal();

      // Render Particles
      this.particles.draw(this.ctx, { x: 0, y: 0 }); // Already transformed by camera.apply

      // Render Player
      const currentSkin = this.getCurrentSkin();
      this.player.draw(this.ctx, { x: 0, y: 0 }, currentSkin);

      this.ctx.restore();
    }

    renderWorldGrid() {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      this.ctx.lineWidth = 1;
      const gridSize = 40;
      const width = this.level.bounds.width;
      const height = this.level.bounds.height;

      for (let x = 0; x <= width; x += gridSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();
      }
      for (let y = 0; y <= height; y += gridSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    renderSignposts() {
      if (!this.level.signposts) return;
      this.ctx.save();
      this.ctx.font = '12px "JetBrains Mono", monospace';
      this.ctx.textAlign = 'center';

      for (let i = 0; i < this.level.signposts.length; i++) {
        const s = this.level.signposts[i];
        this.ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
        this.ctx.fillText(s.text, s.x, s.y);
      }
      this.ctx.restore();
    }

    renderPlatforms() {
      for (let i = 0; i < this.level.platforms.length; i++) {
        const p = this.level.platforms[i];

        if (p.type === 'solid') {
          // Dark cyber block with neon border
          this.ctx.fillStyle = '#141a2e';
          this.ctx.fillRect(p.x, p.y, p.w, p.h);
          this.ctx.strokeStyle = '#2a3a60';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(p.x, p.y, p.w, p.h);

          // Top highlight line
          this.ctx.fillStyle = '#00f0ff';
          this.ctx.fillRect(p.x, p.y, p.w, 3);
        } else if (p.type === 'crumble') {
          if (p.isBroken) continue; // Hidden while broken
          const shakeX = p.shakeOffset || 0;

          this.ctx.fillStyle = p.isCrumbling ? '#ff9900' : '#885522';
          this.ctx.fillRect(p.x + shakeX, p.y, p.w, p.h);
          this.ctx.strokeStyle = '#ffbb33';
          this.ctx.lineWidth = 1.5;
          this.ctx.strokeRect(p.x + shakeX, p.y, p.w, p.h);

          // Crumble cracks visual indicator
          this.ctx.fillStyle = '#ffcc00';
          this.ctx.fillRect(p.x + shakeX, p.y, p.w, 2);
        } else if (p.type === 'fake') {
          // Deceptive fake block looks just like solid ground!
          this.ctx.fillStyle = '#141a2e';
          this.ctx.fillRect(p.x, p.y, p.w, p.h);
          this.ctx.strokeStyle = '#2a3a60';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(p.x, p.y, p.w, p.h);
          this.ctx.fillStyle = '#00f0ff';
          this.ctx.fillRect(p.x, p.y, p.w, 3);
        }
      }
    }

    renderMovers() {
      if (!this.level.movers) return;
      for (let i = 0; i < this.level.movers.length; i++) {
        const m = this.level.movers[i];
        this.ctx.fillStyle = '#1c2642';
        this.ctx.fillRect(m.x, m.y, m.w, m.h);
        this.ctx.strokeStyle = '#00f0ff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(m.x, m.y, m.w, m.h);

        // Center chevron glow
        this.ctx.fillStyle = '#00f0ff';
        this.ctx.fillRect(m.x + m.w / 2 - 8, m.y + m.h / 2 - 2, 16, 4);
      }
    }

    renderHazards() {
      for (let i = 0; i < this.level.hazards.length; i++) {
        const h = this.level.hazards[i];

        if (h.type === 'spike') {
          // Repeating triangle spikes
          this.ctx.fillStyle = '#ff2a5f';
          this.ctx.strokeStyle = '#ff6b8b';
          this.ctx.lineWidth = 1.5;

          const spikeWidth = 14;
          const numSpikes = Math.max(1, Math.floor(h.w / spikeWidth));
          const step = h.w / numSpikes;

          for (let s = 0; s < numSpikes; s++) {
            const sx = h.x + s * step;
            this.ctx.beginPath();
            if (h.dir === 'down') {
              this.ctx.moveTo(sx, h.y);
              this.ctx.lineTo(sx + step / 2, h.y + h.h);
              this.ctx.lineTo(sx + step, h.y);
            } else {
              this.ctx.moveTo(sx, h.y + h.h);
              this.ctx.lineTo(sx + step / 2, h.y);
              this.ctx.lineTo(sx + step, h.y + h.h);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
          }
        } else if (h.type === 'saw') {
          // Rotating buzzsaw blade
          this.ctx.save();
          this.ctx.translate(h.x, h.y);
          this.ctx.rotate(h.angle);

          // Saw teeth
          this.ctx.fillStyle = '#ff2a5f';
          this.ctx.beginPath();
          const teeth = 8;
          for (let t = 0; t < teeth; t++) {
            const rot = (t / teeth) * Math.PI * 2;
            const rInner = h.radius * 0.7;
            const rOuter = h.radius;
            this.ctx.lineTo(Math.cos(rot) * rOuter, Math.sin(rot) * rOuter);
            this.ctx.lineTo(Math.cos(rot + 0.2) * rInner, Math.sin(rot + 0.2) * rInner);
          }
          this.ctx.closePath();
          this.ctx.fill();

          // Saw center hub
          this.ctx.fillStyle = '#ffffff';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, h.radius * 0.35, 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.restore();
        }
      }
    }

    renderFallingSpikes() {
      if (!this.level.fallingSpikes) return;
      for (let i = 0; i < this.level.fallingSpikes.length; i++) {
        const trap = this.level.fallingSpikes[i];
        this.ctx.fillStyle = '#ff2a5f';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;

        // Downward spike shape
        this.ctx.beginPath();
        this.ctx.moveTo(trap.x, trap.y);
        this.ctx.lineTo(trap.x + trap.w / 2, trap.y + trap.h);
        this.ctx.lineTo(trap.x + trap.w, trap.y);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Telegraph hint before trigger
        if (!trap.triggered) {
          this.ctx.fillStyle = '#ffea00';
          this.ctx.font = '10px "JetBrains Mono", monospace';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('▼', trap.x + trap.w / 2, trap.y - 6);
        }
      }
    }

    renderBouncePads() {
      if (!this.level.bouncePads) return;
      for (let i = 0; i < this.level.bouncePads.length; i++) {
        const pad = this.level.bouncePads[i];
        this.ctx.fillStyle = '#00f0ff';
        this.ctx.shadowColor = '#00f0ff';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
        this.ctx.shadowBlur = 0;

        // Spring coils visual
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(pad.x, pad.y, pad.w, pad.h);
      }
    }

    renderCheckpoint() {
      if (!this.level.checkpoint) return;
      const cp = this.level.checkpoint;
      const active = this.checkpointReached;

      // Pole
      this.ctx.fillStyle = '#8899b8';
      this.ctx.fillRect(cp.x, cp.y - 36, 4, 36);

      // Flag
      this.ctx.fillStyle = active ? '#39ff14' : '#ffea00';
      this.ctx.shadowColor = active ? 'rgba(57, 255, 20, 0.8)' : 'rgba(255, 234, 0, 0.4)';
      this.ctx.shadowBlur = 8;

      const wave = Math.sin(performance.now() * 0.006) * 3;
      this.ctx.beginPath();
      this.ctx.moveTo(cp.x + 4, cp.y - 36);
      this.ctx.lineTo(cp.x + 24 + wave, cp.y - 28);
      this.ctx.lineTo(cp.x + 4, cp.y - 20);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    renderGoal() {
      if (!this.level.goal) return;
      const g = this.level.goal;
      const time = performance.now() * 0.004;

      // Pulsing Neon Goal Portal
      this.ctx.save();
      this.ctx.shadowColor = '#00f0ff';
      this.ctx.shadowBlur = 16;
      this.ctx.strokeStyle = '#00f0ff';
      this.ctx.lineWidth = 3;

      this.ctx.strokeRect(g.x, g.y, g.w, g.h);

      // Portal swirl bands
      this.ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
      this.ctx.fillRect(g.x, g.y, g.w, g.h);

      const wave = Math.sin(time) * (g.h / 4);
      this.ctx.fillStyle = '#ffea00';
      this.ctx.fillRect(g.x + 4, g.y + g.h / 2 + wave - 3, g.w - 8, 6);

      // Trophy label on top of goal
      this.ctx.font = '16px serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('🏆', g.x + g.w / 2, g.y - 10);

      this.ctx.restore();
    }
  }

  // ============================================================================
  // 11. BOOTSTRAP UPON DOM READY
  // ============================================================================
  window.addEventListener('DOMContentLoaded', () => {
    window.RageJumpGame = new GameController();
  });

})();