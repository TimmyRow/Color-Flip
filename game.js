(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.querySelector("#score");
  const bestEl = document.querySelector("#best");
  const streakEl = document.querySelector("#streak");
  const curtain = document.querySelector("#curtain");
  const playButton = document.querySelector("#play");
  const flipButton = document.querySelector("#flip");
  const pauseButton = document.querySelector("#pause");
  const muteButton = document.querySelector("#mute");
  const restartButton = document.querySelector("#restart");

  const STORAGE_KEY = "color-flip-best";
  const COLORS = [
    { name: "red", value: "#ff4d5f", glow: "rgba(255, 77, 95, 0.38)" },
    { name: "yellow", value: "#ffd15c", glow: "rgba(255, 209, 92, 0.36)" },
    { name: "blue", value: "#46a6ff", glow: "rgba(70, 166, 255, 0.38)" },
    { name: "green", value: "#3ee28a", glow: "rgba(62, 226, 138, 0.36)" }
  ];

  const state = {
    mode: "ready",
    lastTime: 0,
    score: 0,
    best: readBest(),
    streak: 1,
    rotation: 0,
    targetRotation: 0,
    drop: null,
    nextColor: 0,
    speed: 292,
    spawnDelay: 0,
    shake: 0,
    muted: false,
    particles: [],
    flashes: []
  };

  const poki = createPokiBridge();
  bestEl.textContent = String(state.best);

  function readBest() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY) || "0");
    } catch {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Device storage is optional for Poki builds.
    }
  }

  function createPokiBridge() {
    const localHosts = new Set(["", "localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
    const pokiHosts = ["poki.com", "poki-gdn.com", "poki.dev"];
    const isLocal = localHosts.has(location.hostname);
    const enabled = !isLocal && pokiHosts.some((host) => location.hostname === host || location.hostname.endsWith(`.${host}`));
    let initialized = false;
    let playing = false;

    function call(method) {
      if (!initialized || typeof window.PokiSDK?.[method] !== "function") return;
      try {
        window.PokiSDK[method]();
      } catch {
        // Platform calls should never interrupt play.
      }
    }

    return {
      async init() {
        if (!enabled) return;
        try {
          if (!window.PokiSDK) {
            await new Promise((resolve, reject) => {
              const script = document.createElement("script");
              script.src = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
              script.async = true;
              script.onload = resolve;
              script.onerror = reject;
              document.head.append(script);
            });
          }
          await window.PokiSDK.init();
          initialized = true;
        } catch {
          initialized = false;
        }
      },
      loadingFinished() {
        call("gameLoadingFinished");
      },
      gameplayStart() {
        if (playing) return;
        playing = true;
        call("gameplayStart");
      },
      gameplayStop() {
        if (!playing) return;
        playing = false;
        call("gameplayStop");
      },
      async commercialBreak() {
        if (!initialized || typeof window.PokiSDK?.commercialBreak !== "function") return;
        try {
          await window.PokiSDK.commercialBreak();
        } catch {
          // Ads are opportunistic.
        }
      }
    };
  }

  function resetGame() {
    state.mode = "playing";
    state.score = 0;
    state.streak = 1;
    state.rotation = 0;
    state.targetRotation = 0;
    state.speed = 292;
    state.spawnDelay = 0.2;
    state.shake = 0;
    state.drop = null;
    state.particles.length = 0;
    state.flashes.length = 0;
    state.nextColor = Math.floor(Math.random() * COLORS.length);
    curtain.classList.add("hidden");
    pauseButton.textContent = "Pause";
    updateHud();
    poki.gameplayStart();
    spawnDrop();
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
    streakEl.textContent = `x${state.streak}`;
  }

  function spawnDrop() {
    const color = state.nextColor;
    let next = Math.floor(Math.random() * COLORS.length);
    if (Math.random() < 0.54) {
      next = (color + 1 + Math.floor(Math.random() * 3)) % COLORS.length;
    }
    state.nextColor = next;
    state.drop = {
      color,
      x: canvas.width / 2,
      y: -58,
      size: 66,
      angle: Math.random() * Math.PI,
      spin: (Math.random() > 0.5 ? 1 : -1) * (1.1 + Math.random() * 0.9)
    };
  }

  function rotateSquare() {
    if (state.mode === "ready" || state.mode === "over") {
      resetGame();
      return;
    }
    if (state.mode !== "playing") return;
    state.targetRotation += Math.PI / 2;
    playTone(330 + (state.targetRotation % (Math.PI * 2)) * 60, 0.035, "triangle", 0.03);
  }

  function pauseGame() {
    if (state.mode === "playing") {
      state.mode = "paused";
      pauseButton.textContent = "Resume";
      curtain.querySelector("h2").textContent = "Paused";
      curtain.querySelector("p").textContent = "Color Flip";
      playButton.textContent = "Resume";
      curtain.classList.remove("hidden");
      poki.gameplayStop();
      return;
    }
    if (state.mode === "paused") {
      state.mode = "playing";
      curtain.classList.add("hidden");
      pauseButton.textContent = "Pause";
      poki.gameplayStart();
    }
  }

  function gameOver() {
    state.mode = "over";
    state.shake = 16;
    poki.gameplayStop();
    if (state.score > state.best) {
      state.best = state.score;
      writeBest(state.best);
    }
    updateHud();
    curtain.querySelector("h2").textContent = state.score === state.best && state.score > 0 ? "New best." : "Try again.";
    curtain.querySelector("p").textContent = `${state.score} points`;
    playButton.textContent = "Replay";
    curtain.classList.remove("hidden");
    playTone(92, 0.2, "sawtooth", 0.035);
    poki.commercialBreak();
  }

  function scoreHit() {
    state.score += 1 * state.streak;
    state.streak = Math.min(9, state.streak + 1);
    state.speed = Math.min(560, state.speed + 7);
    updateHud();
    state.flashes.push({ life: 0.16, color: COLORS[state.drop.color].glow });
    burst(canvas.width / 2, impactY(), COLORS[state.drop.color].value, 28);
    playTone(520 + state.streak * 38, 0.05, "sine", 0.035);
    state.drop = null;
    state.spawnDelay = Math.max(0.12, 0.34 - state.score * 0.004);
  }

  function topColorIndex() {
    const quarterTurns = Math.round(state.targetRotation / (Math.PI / 2));
    return ((quarterTurns % COLORS.length) + COLORS.length) % COLORS.length;
  }

  function impactY() {
    return canvas.height * 0.67 - squareSize() / 2 - 3;
  }

  function squareSize() {
    return Math.min(canvas.width * 0.38, canvas.height * 0.26, 244);
  }

  function update(dt) {
    const ease = 1 - Math.pow(0.001, dt);
    state.rotation += (state.targetRotation - state.rotation) * ease;
    state.shake = Math.max(0, state.shake - dt * 42);

    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 520 * dt;
      if (particle.life <= 0) state.particles.splice(index, 1);
    }

    for (let index = state.flashes.length - 1; index >= 0; index -= 1) {
      state.flashes[index].life -= dt;
      if (state.flashes[index].life <= 0) state.flashes.splice(index, 1);
    }

    if (state.mode !== "playing") return;
    if (!state.drop) {
      state.spawnDelay -= dt;
      if (state.spawnDelay <= 0) spawnDrop();
      return;
    }

    state.drop.y += state.speed * dt;
    state.drop.angle += state.drop.spin * dt;
    if (state.drop.y + state.drop.size / 2 >= impactY()) {
      if (state.drop.color === topColorIndex()) {
        scoreHit();
      } else {
        burst(canvas.width / 2, impactY(), "#f6f7fb", 34);
        gameOver();
      }
    }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.24;
      const speed = 115 + Math.random() * 300;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        size: 3 + Math.random() * 6,
        color,
        life: 0.42 + Math.random() * 0.28
      });
    }
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;
    ctx.translate(shakeX, shakeY);
    drawGuide();
    drawSquare();
    drawDrop();
    drawNext();
    drawParticles();
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#151b29");
    gradient.addColorStop(0.54, "#10141f");
    gradient.addColorStop(1, "#181923");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
    ctx.lineWidth = 2;
    const gap = 72;
    for (let y = -gap; y < canvas.height + gap; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y + 90);
      ctx.stroke();
    }

    for (const flash of state.flashes) {
      ctx.globalAlpha = Math.max(0, flash.life / 0.16);
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  function drawGuide() {
    const y = impactY();
    ctx.save();
    ctx.strokeStyle = "rgba(246, 247, 251, 0.18)";
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.25, y);
    ctx.lineTo(canvas.width * 0.75, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSquare() {
    const size = squareSize();
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.67;
    const half = size / 2;
    const thickness = Math.max(24, size * 0.22);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.rotation);
    ctx.lineCap = "round";
    ctx.lineWidth = thickness;
    ctx.shadowBlur = 22;

    const sides = [
      [[-half, -half], [half, -half]],
      [[half, -half], [half, half]],
      [[half, half], [-half, half]],
      [[-half, half], [-half, -half]]
    ];

    sides.forEach((side, index) => {
      ctx.shadowColor = COLORS[index].glow;
      ctx.strokeStyle = COLORS[index].value;
      ctx.beginPath();
      ctx.moveTo(side[0][0], side[0][1]);
      ctx.lineTo(side[1][0], side[1][1]);
      ctx.stroke();
    });

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#111722";
    roundRect(-half + thickness * 0.62, -half + thickness * 0.62, size - thickness * 1.24, size - thickness * 1.24, 16);
    ctx.fill();
    ctx.restore();
  }

  function drawDrop() {
    if (!state.drop) return;
    const drop = state.drop;
    const color = COLORS[drop.color];
    ctx.save();
    ctx.translate(drop.x, drop.y);
    ctx.rotate(drop.angle);
    ctx.shadowBlur = 26;
    ctx.shadowColor = color.glow;
    ctx.fillStyle = color.value;
    roundRect(-drop.size / 2, -drop.size / 2, drop.size, drop.size, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
    roundRect(-drop.size * 0.25, -drop.size * 0.28, drop.size * 0.24, drop.size * 0.16, 6);
    ctx.fill();
    ctx.restore();
  }

  function drawNext() {
    const color = COLORS[state.nextColor];
    const x = canvas.width - 92;
    const y = 80;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    roundRect(x - 44, y - 42, 88, 84, 8);
    ctx.fill();
    ctx.fillStyle = color.value;
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 18;
    roundRect(x - 20, y - 10, 40, 40, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(246, 247, 251, 0.72)";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NEXT", x, y - 18);
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / 0.7);
      ctx.fillStyle = particle.color;
      roundRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size, 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  let audioContext = null;
  function playTone(frequency, duration, type, gain) {
    if (state.muted) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const volume = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(gain, audioContext.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(volume);
      volume.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch {
      state.muted = true;
    }
  }

  function frame(time) {
    const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0);
    state.lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function handlePrimaryAction(event) {
    event.preventDefault();
    rotateSquare();
  }

  playButton.addEventListener("click", () => {
    if (state.mode === "paused") {
      pauseGame();
    } else {
      resetGame();
    }
  });
  flipButton.addEventListener("pointerdown", handlePrimaryAction);
  canvas.addEventListener("pointerdown", handlePrimaryAction);
  restartButton.addEventListener("click", resetGame);
  pauseButton.addEventListener("click", pauseGame);
  muteButton.addEventListener("click", () => {
    state.muted = !state.muted;
    muteButton.textContent = state.muted ? "Muted" : "Sound";
    muteButton.setAttribute("aria-pressed", String(state.muted));
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ArrowRight" || event.code === "ArrowUp") {
      event.preventDefault();
      rotateSquare();
    }
    if (event.code === "KeyP") pauseGame();
    if (event.code === "KeyR") resetGame();
  });
  window.addEventListener("blur", () => {
    if (state.mode === "playing") pauseGame();
  });

  poki.init().finally(() => {
    poki.loadingFinished();
    window.__colorFlipDebug = {
      getState: () => ({
        mode: state.mode,
        score: state.score,
        best: state.best,
        streak: state.streak,
        hasDrop: Boolean(state.drop),
        topColor: COLORS[topColorIndex()].name
      })
    };
  });
  requestAnimationFrame(frame);
})();
