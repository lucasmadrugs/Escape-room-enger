/* ============================================
   ESCAPE ROOM TIMER - Application Logic
   ============================================ */

(() => {
  'use strict';

  // ---- Configuration ----
  const TOTAL_TIME = 15 * 60; // 15 minutes in seconds
  const WARNING_TIME = 3 * 60; // 3 minutes - orange warning
  const DANGER_TIME = 60;      // 1 minute - red danger
  const CRITICAL_TIME = 15;    // 15 seconds - critical flashing
  const RING_CIRCUMFERENCE = 2 * Math.PI * 180; // ~1130.97

  // ---- DOM Elements ----
  const startScreen = document.getElementById('start-screen');
  const timerScreen = document.getElementById('timer-screen');
  const explosionScreen = document.getElementById('explosion-screen');
  const successScreen = document.getElementById('success-screen');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const restartSuccessBtn = document.getElementById('restart-success-btn');
  const stopBtn = document.getElementById('stop-btn');
  const resetBtn = document.getElementById('reset-btn');
  const explodeBtn = document.getElementById('explode-btn');
  const defuseBtn = document.getElementById('defuse-btn');
  const timerDigits = document.getElementById('timer-digits');
  const timerMs = document.getElementById('timer-ms');
  const progressRing = document.getElementById('progress-ring');
  const progressBar = document.getElementById('progress-bar');
  const elapsedTime = document.getElementById('elapsed-time');
  const progressPercent = document.getElementById('progress-percent');
  const explosionCanvas = document.getElementById('explosion-canvas');
  const explosionCtx = explosionCanvas.getContext('2d');
  const bgCanvas = document.getElementById('bg-canvas');
  const bgCtx = bgCanvas.getContext('2d');
  const screenFlash = document.getElementById('screen-flash');
  const confettiCanvas = document.getElementById('confetti-canvas');
  const confettiCtx = confettiCanvas.getContext('2d');
  const successElapsed = document.getElementById('success-elapsed');
  const successRemaining = document.getElementById('success-remaining');

  // ---- State ----
  let timerInterval = null;
  let startTimestamp = 0;
  let remainingMs = TOTAL_TIME * 1000;
  let isRunning = false;
  let audioCtx = null;
  let lastBeepSecond = -1;
  let bgParticles = [];
  let explosionParticles = [];
  let explosionActive = false;
  let confettiParticles = [];
  let confettiActive = false;

  // ---- Audio System (Web Audio API) ----
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playBeep(frequency = 880, duration = 0.12, volume = 0.3, type = 'square') {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function playTickBeep() {
    playBeep(600, 0.06, 0.08, 'sine');
  }

  function playWarningBeep() {
    playBeep(880, 0.15, 0.2, 'square');
  }

  function playDangerBeep() {
    playBeep(1200, 0.2, 0.35, 'square');
    setTimeout(() => playBeep(1400, 0.15, 0.25, 'square'), 100);
  }

  function playCriticalBeep() {
    playBeep(1600, 0.25, 0.5, 'sawtooth');
    setTimeout(() => playBeep(1800, 0.2, 0.4, 'sawtooth'), 80);
    setTimeout(() => playBeep(2000, 0.15, 0.35, 'sawtooth'), 160);
  }

  function playExplosionSound() {
    const ctx = getAudioContext();

    // Layer 1: Deep boom (low frequency noise burst)
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < bufferSize; i++) {
        const t = i / ctx.sampleRate;
        // Decaying noise with low-pass character
        const decay = Math.exp(-t * 2.5);
        const noise = (Math.random() * 2 - 1) * decay;
        // Add some low-frequency rumble
        const rumble = Math.sin(2 * Math.PI * 40 * t) * Math.exp(-t * 1.5) * 0.5;
        const crackle = Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 3) * 0.3;
        data[i] = (noise * 0.6 + rumble + crackle) * 0.8;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Low-pass filter for deep boom
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(800, ctx.currentTime);
    lowpass.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 1.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.0, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);

    // Compressor for punch
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);

    source.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    // Layer 2: High-frequency crack
    const crackBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const crackData = crackBuffer.getChannelData(0);
    for (let i = 0; i < crackData.length; i++) {
      const t = i / ctx.sampleRate;
      crackData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 15) * 0.7;
    }

    const crackSource = ctx.createBufferSource();
    crackSource.buffer = crackBuffer;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(2000, ctx.currentTime);

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.6, ctx.currentTime);
    crackGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    crackSource.connect(highpass);
    highpass.connect(crackGain);
    crackGain.connect(ctx.destination);
    crackSource.start();

    // Layer 3: Sub-bass thud
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(60, ctx.currentTime);
    subOsc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.8, ctx.currentTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start();
    subOsc.stop(ctx.currentTime + 2);
  }

  function playStartSound() {
    const ctx = getAudioContext();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      setTimeout(() => {
        playBeep(freq, 0.15, 0.15, 'sine');
      }, i * 100);
    });
  }

  // ---- Background Particles ----
  function initBgCanvas() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;

    bgParticles = [];
    const count = Math.min(60, Math.floor((bgCanvas.width * bgCanvas.height) / 15000));

    for (let i = 0; i < count; i++) {
      bgParticles.push({
        x: Math.random() * bgCanvas.width,
        y: Math.random() * bgCanvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.3 + 0.05,
      });
    }
  }

  function drawBgParticles() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    bgParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = bgCanvas.width;
      if (p.x > bgCanvas.width) p.x = 0;
      if (p.y < 0) p.y = bgCanvas.height;
      if (p.y > bgCanvas.height) p.y = 0;

      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(100, 200, 255, ${p.alpha})`;
      bgCtx.fill();
    });

    // Draw connections
    for (let i = 0; i < bgParticles.length; i++) {
      for (let j = i + 1; j < bgParticles.length; j++) {
        const dx = bgParticles[i].x - bgParticles[j].x;
        const dy = bgParticles[i].y - bgParticles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          bgCtx.beginPath();
          bgCtx.moveTo(bgParticles[i].x, bgParticles[i].y);
          bgCtx.lineTo(bgParticles[j].x, bgParticles[j].y);
          bgCtx.strokeStyle = `rgba(100, 200, 255, ${0.05 * (1 - dist / 120)})`;
          bgCtx.lineWidth = 0.5;
          bgCtx.stroke();
        }
      }
    }

    requestAnimationFrame(drawBgParticles);
  }

  // ---- Explosion Particles ----
  function initExplosionCanvas() {
    explosionCanvas.width = window.innerWidth;
    explosionCanvas.height = window.innerHeight;
  }

  function triggerExplosion() {
    explosionActive = true;
    explosionCanvas.classList.add('active');
    explosionParticles = [];

    const cx = explosionCanvas.width / 2;
    const cy = explosionCanvas.height / 2;
    const particleCount = 300;

    // Fire/debris particles
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 15 + 3;
      const size = Math.random() * 8 + 2;

      explosionParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: size,
        life: 1,
        decay: Math.random() * 0.015 + 0.005,
        color: getExplosionColor(),
        gravity: Math.random() * 0.05 + 0.02,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        type: Math.random() > 0.7 ? 'spark' : 'fire',
      });
    }

    // Smoke particles
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;

      explosionParticles.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        size: Math.random() * 30 + 15,
        life: 1,
        decay: Math.random() * 0.005 + 0.003,
        color: `rgba(80, 40, 20, `,
        gravity: -0.02,
        rotation: 0,
        rotSpeed: 0,
        type: 'smoke',
      });
    }

    drawExplosion();
  }

  function getExplosionColor() {
    const colors = [
      '#ff4400', '#ff6600', '#ff8800', '#ffaa00',
      '#ffcc00', '#ff2200', '#ff0000', '#ffffff',
      '#ffdd44', '#ff5500',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function drawExplosion() {
    if (!explosionActive) return;

    explosionCtx.clearRect(0, 0, explosionCanvas.width, explosionCanvas.height);

    let alive = false;

    explosionParticles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.99;
      p.life -= p.decay;
      p.rotation += p.rotSpeed;

      if (p.type === 'smoke') {
        p.size += 0.5;
        explosionCtx.beginPath();
        explosionCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        explosionCtx.fillStyle = p.color + (p.life * 0.2).toFixed(3) + ')';
        explosionCtx.fill();
      } else if (p.type === 'spark') {
        explosionCtx.save();
        explosionCtx.translate(p.x, p.y);
        explosionCtx.rotate(p.rotation);
        explosionCtx.beginPath();
        explosionCtx.moveTo(-p.size * 2, 0);
        explosionCtx.lineTo(p.size * 2, 0);
        explosionCtx.strokeStyle = p.color;
        explosionCtx.globalAlpha = p.life;
        explosionCtx.lineWidth = p.size * 0.4;
        explosionCtx.stroke();
        explosionCtx.restore();
      } else {
        explosionCtx.save();
        explosionCtx.globalAlpha = p.life;
        explosionCtx.beginPath();
        explosionCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        explosionCtx.fillStyle = p.color;
        explosionCtx.shadowColor = p.color;
        explosionCtx.shadowBlur = 15;
        explosionCtx.fill();
        explosionCtx.restore();
      }
    });

    // Central glow that fades
    const cx = explosionCanvas.width / 2;
    const cy = explosionCanvas.height / 2;
    const glowLife = explosionParticles.length > 0 ? Math.max(...explosionParticles.map(p => p.life)) : 0;

    if (glowLife > 0.3) {
      const gradient = explosionCtx.createRadialGradient(cx, cy, 0, cx, cy, 200 * glowLife);
      gradient.addColorStop(0, `rgba(255, 200, 50, ${glowLife * 0.4})`);
      gradient.addColorStop(0.5, `rgba(255, 100, 0, ${glowLife * 0.2})`);
      gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      explosionCtx.fillStyle = gradient;
      explosionCtx.fillRect(0, 0, explosionCanvas.width, explosionCanvas.height);
    }

    if (alive) {
      requestAnimationFrame(drawExplosion);
    } else {
      explosionActive = false;
      explosionCtx.clearRect(0, 0, explosionCanvas.width, explosionCanvas.height);
      explosionCanvas.classList.remove('active');
    }
  }

  // ---- Tick Marks ----
  function createTickMarks() {
    const tickGroup = document.getElementById('tick-marks');
    tickGroup.innerHTML = '';
    const tickCount = 60;
    const cx = 200, cy = 200, r = 168;

    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
      const isMajor = i % 5 === 0;
      const innerR = isMajor ? r - 10 : r - 5;

      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * r;
      const y2 = cy + Math.sin(angle) * r;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', isMajor ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)');
      line.setAttribute('stroke-width', isMajor ? '2' : '1');
      tickGroup.appendChild(line);
    }
  }

  // ---- Timer Logic ----
  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    const now = performance.now();
    const elapsed = now - startTimestamp;
    remainingMs = Math.max(0, TOTAL_TIME * 1000 - elapsed);

    const totalSecondsLeft = remainingMs / 1000;
    const currentSecond = Math.ceil(totalSecondsLeft);
    const ms = Math.floor((remainingMs % 1000) / 10);

    // Update digits
    timerDigits.textContent = formatTime(totalSecondsLeft);
    timerMs.textContent = `.${String(ms).padStart(2, '0')}`;

    // Update elapsed
    const elapsedSec = TOTAL_TIME - totalSecondsLeft;
    elapsedTime.textContent = formatTime(elapsedSec);

    // Update progress
    const progress = (elapsedSec / TOTAL_TIME) * 100;
    progressPercent.textContent = `${Math.floor(progress)}%`;
    progressBar.style.width = `${progress}%`;

    // Update ring
    const ringOffset = (1 - totalSecondsLeft / TOTAL_TIME) * RING_CIRCUMFERENCE;
    progressRing.style.strokeDashoffset = ringOffset;

    // Phase detection and effects
    applyPhaseEffects(totalSecondsLeft, currentSecond);

    // Check if time is up
    if (remainingMs <= 0) {
      timerDigits.textContent = '00:00';
      timerMs.textContent = '.00';
      endTimer();
      return;
    }

    timerInterval = requestAnimationFrame(updateTimerDisplay);
  }

  function applyPhaseEffects(totalSecondsLeft, currentSecond) {
    // Remove all phase classes
    const phaseClasses = ['warning', 'danger', 'critical'];

    if (totalSecondsLeft <= CRITICAL_TIME) {
      // CRITICAL PHASE: < 15 seconds
      timerDigits.className = 'timer-digits critical';
      progressRing.classList.add('danger');
      progressRing.classList.remove('warning');
      progressBar.className = 'progress-bar danger';
      timerMs.className = 'timer-ms danger';
      timerScreen.classList.add('timer-screen-shake');

      // Rapid beeps every second
      if (currentSecond !== lastBeepSecond && currentSecond > 0) {
        lastBeepSecond = currentSecond;
        playCriticalBeep();
      }

    } else if (totalSecondsLeft <= DANGER_TIME) {
      // DANGER PHASE: < 1 minute
      timerDigits.className = 'timer-digits danger';
      progressRing.classList.add('danger');
      progressRing.classList.remove('warning');
      progressBar.className = 'progress-bar danger';
      timerMs.className = 'timer-ms danger';
      timerScreen.classList.remove('timer-screen-shake');

      // Beep every 2 seconds
      if (currentSecond !== lastBeepSecond && currentSecond % 2 === 0) {
        lastBeepSecond = currentSecond;
        playDangerBeep();
      }

    } else if (totalSecondsLeft <= WARNING_TIME) {
      // WARNING PHASE: < 3 minutes
      timerDigits.className = 'timer-digits warning';
      progressRing.classList.add('warning');
      progressRing.classList.remove('danger');
      progressBar.className = 'progress-bar warning';
      timerMs.className = 'timer-ms';
      timerScreen.classList.remove('timer-screen-shake');

      // Beep every 10 seconds
      if (currentSecond !== lastBeepSecond && currentSecond % 10 === 0) {
        lastBeepSecond = currentSecond;
        playWarningBeep();
      }

    } else {
      // NORMAL PHASE
      timerDigits.className = 'timer-digits';
      progressRing.classList.remove('warning', 'danger');
      progressBar.className = 'progress-bar';
      timerMs.className = 'timer-ms';
      timerScreen.classList.remove('timer-screen-shake');

      // Subtle tick every 30 seconds
      if (currentSecond !== lastBeepSecond && currentSecond % 30 === 0) {
        lastBeepSecond = currentSecond;
        playTickBeep();
      }
    }
  }

  function startTimer() {
    // Transition screens
    startScreen.classList.remove('active');
    timerScreen.classList.add('active');

    playStartSound();

    // Reset state
    remainingMs = TOTAL_TIME * 1000;
    lastBeepSecond = -1;
    startTimestamp = performance.now();
    isRunning = true;

    // Start the timer loop
    timerInterval = requestAnimationFrame(updateTimerDisplay);
  }

  function endTimer() {
    isRunning = false;
    if (timerInterval) {
      cancelAnimationFrame(timerInterval);
      timerInterval = null;
    }

    timerScreen.classList.remove('timer-screen-shake');

    // Screen flash
    screenFlash.classList.add('flash');
    setTimeout(() => screenFlash.classList.remove('flash'), 700);

    // Play explosion sound
    playExplosionSound();

    // Trigger explosion particles
    initExplosionCanvas();
    triggerExplosion();

    // Show explosion screen after a tiny delay
    setTimeout(() => {
      timerScreen.classList.remove('active');
      explosionScreen.classList.add('active');
    }, 300);
  }

  function resetToStart() {
    explosionScreen.classList.remove('active');
    explosionActive = false;
    explosionCtx.clearRect(0, 0, explosionCanvas.width, explosionCanvas.height);
    explosionCanvas.classList.remove('active');

    // Reset timer display
    timerDigits.textContent = '15:00';
    timerMs.textContent = '.00';
    timerDigits.className = 'timer-digits';
    progressRing.style.strokeDashoffset = 0;
    progressRing.classList.remove('warning', 'danger');
    progressBar.style.width = '0%';
    progressBar.className = 'progress-bar';
    elapsedTime.textContent = '00:00';
    progressPercent.textContent = '0%';
    timerMs.className = 'timer-ms';

    // Show start screen
    startScreen.classList.add('active');
    timerScreen.classList.remove('active');
  }

  function stopTimer() {
    isRunning = false;
    if (timerInterval) {
      cancelAnimationFrame(timerInterval);
      timerInterval = null;
    }
    timerScreen.classList.remove('timer-screen-shake');
    resetToStart();
  }

  // ---- Success / Defuse System ----
  function playSuccessSound() {
    const ctx = getAudioContext();
    // Ascending triumphant chord
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.2);
      }, i * 150);
    });

    // Victory fanfare second wave
    setTimeout(() => {
      [783.99, 987.77, 1174.66, 1567.98].forEach((freq, i) => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 1.5);
        }, i * 120);
      });
    }, 500);
  }

  function defuseTimer() {
    if (!isRunning) return;

    isRunning = false;
    if (timerInterval) {
      cancelAnimationFrame(timerInterval);
      timerInterval = null;
    }
    timerScreen.classList.remove('timer-screen-shake');

    // Calculate times
    const elapsed = performance.now() - startTimestamp;
    const elapsedSec = elapsed / 1000;
    const remainSec = Math.max(0, TOTAL_TIME - elapsedSec);

    successElapsed.textContent = formatTime(elapsedSec);
    successRemaining.textContent = formatTime(remainSec);

    // Green flash
    screenFlash.style.background = '#00ff88';
    screenFlash.classList.add('flash');
    setTimeout(() => {
      screenFlash.classList.remove('flash');
      screenFlash.style.background = '';
    }, 700);

    playSuccessSound();

    // Show success screen
    setTimeout(() => {
      timerScreen.classList.remove('active');
      successScreen.classList.add('active');
      initConfetti();
      launchConfetti();
    }, 200);
  }

  function resetFromSuccess() {
    successScreen.classList.remove('active');
    confettiActive = false;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    resetToStart();
  }

  // ---- Confetti System ----
  function initConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }

  function launchConfetti() {
    confettiActive = true;
    confettiParticles = [];

    const colors = [
      '#00ff88', '#00ccff', '#ffcc00', '#ff44aa',
      '#88ff00', '#44aaff', '#ffaa00', '#ff6644',
      '#aa66ff', '#ffffff',
    ];

    for (let i = 0; i < 200; i++) {
      confettiParticles.push({
        x: Math.random() * confettiCanvas.width,
        y: -20 - Math.random() * confettiCanvas.height * 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.05 + 0.02,
        life: 1,
        decay: Math.random() * 0.001 + 0.001,
      });
    }

    drawConfetti();

    // Keep spawning confetti waves
    let waves = 0;
    const waveInterval = setInterval(() => {
      waves++;
      if (waves > 5 || !confettiActive) {
        clearInterval(waveInterval);
        return;
      }
      for (let i = 0; i < 60; i++) {
        confettiParticles.push({
          x: Math.random() * confettiCanvas.width,
          y: -20 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * 3 + 2,
          size: Math.random() * 8 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.15,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: Math.random() * 0.05 + 0.02,
          life: 1,
          decay: Math.random() * 0.001 + 0.001,
        });
      }
    }, 1500);
  }

  function drawConfetti() {
    if (!confettiActive) return;

    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = false;

    confettiParticles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;

      p.wobble += p.wobbleSpeed;
      p.x += p.vx + Math.sin(p.wobble) * 0.8;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.life -= p.decay;
      p.vy += 0.02; // gravity

      // Remove if fallen off screen
      if (p.y > confettiCanvas.height + 20) {
        p.life = 0;
        return;
      }

      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rotation);
      confettiCtx.globalAlpha = Math.min(p.life, 1);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      confettiCtx.restore();
    });

    if (alive) {
      requestAnimationFrame(drawConfetti);
    } else {
      confettiActive = false;
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  // ---- Event Listeners ----
  startBtn.addEventListener('click', startTimer);
  restartBtn.addEventListener('click', resetToStart);
  restartSuccessBtn.addEventListener('click', resetFromSuccess);
  stopBtn.addEventListener('click', stopTimer);
  resetBtn.addEventListener('click', () => {
    stopTimer();
    startTimer();
  });
  explodeBtn.addEventListener('click', endTimer);
  defuseBtn.addEventListener('click', defuseTimer);

  // Handle keyboard (Space / Enter to start)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (startScreen.classList.contains('active')) {
        e.preventDefault();
        startTimer();
      } else if (explosionScreen.classList.contains('active')) {
        e.preventDefault();
        resetToStart();
      } else if (successScreen.classList.contains('active')) {
        e.preventDefault();
        resetFromSuccess();
      }
    }
  });

  // Handle resize
  window.addEventListener('resize', () => {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    if (explosionActive) {
      explosionCanvas.width = window.innerWidth;
      explosionCanvas.height = window.innerHeight;
    }
  });

  // ---- Initialize ----
  createTickMarks();
  initBgCanvas();
  initExplosionCanvas();
  drawBgParticles();
})();
