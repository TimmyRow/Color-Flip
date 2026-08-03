(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.querySelector("#score");
  const bestEl = document.querySelector("#best");
  const streakEl = document.querySelector("#streak");
  const coinsEl = document.querySelector("#coins");
  const curtain = document.querySelector("#curtain");
  const playButton = document.querySelector("#play");
  const flipButton = document.querySelector("#flip");
  const pauseButton = document.querySelector("#pause");
  const muteButton = document.querySelector("#mute");
  const shopButton = document.querySelector("#shop");
  const restartButton = document.querySelector("#restart");
  const shopPanel = document.querySelector("#shopPanel");
  const shopClose = document.querySelector("#shopClose");
  const shopWallet = document.querySelector("#shopWallet");
  const paletteShop = document.querySelector("#paletteShop");
  const backgroundShop = document.querySelector("#backgroundShop");
  const coinShop = document.querySelector("#coinShop");

  const STORAGE = {
    best: "color-flip-best",
    coins: "color-flip-coins",
    palette: "color-flip-palette",
    background: "color-flip-background",
    coin: "color-flip-coin",
    ownedPalettes: "color-flip-owned-palettes",
    ownedBackgrounds: "color-flip-owned-backgrounds",
    ownedCoins: "color-flip-owned-coins"
  };

  const PALETTES = [
    {
      id: "classic",
      name: "Classic Pop",
      price: 0,
      note: "Bright arcade colors.",
      colors: [
        { name: "red", value: "#ff4d5f", glow: "rgba(255, 77, 95, 0.38)" },
        { name: "yellow", value: "#ffd15c", glow: "rgba(255, 209, 92, 0.36)" },
        { name: "blue", value: "#46a6ff", glow: "rgba(70, 166, 255, 0.38)" },
        { name: "green", value: "#3ee28a", glow: "rgba(62, 226, 138, 0.36)" }
      ]
    },
    {
      id: "neon",
      name: "Neon Circuit",
      price: 80,
      note: "Sharper electric sides.",
      colors: [
        { name: "pink", value: "#ff3bd4", glow: "rgba(255, 59, 212, 0.38)" },
        { name: "lime", value: "#b6ff3b", glow: "rgba(182, 255, 59, 0.34)" },
        { name: "cyan", value: "#27f3ff", glow: "rgba(39, 243, 255, 0.35)" },
        { name: "violet", value: "#8a5cff", glow: "rgba(138, 92, 255, 0.38)" }
      ]
    },
    {
      id: "sorbet",
      name: "Sorbet Tilt",
      price: 120,
      note: "Soft, readable pastels.",
      colors: [
        { name: "berry", value: "#ff7790", glow: "rgba(255, 119, 144, 0.34)" },
        { name: "mango", value: "#ffc857", glow: "rgba(255, 200, 87, 0.34)" },
        { name: "pool", value: "#65d4ff", glow: "rgba(101, 212, 255, 0.34)" },
        { name: "mint", value: "#6df2b2", glow: "rgba(109, 242, 178, 0.34)" }
      ]
    }
  ];

  const BACKGROUNDS = [
    { id: "midnight", name: "Midnight Glass", price: 0, note: "Clean dark arena.", stops: ["#151b29", "#10141f", "#181923"], line: "rgba(255, 255, 255, 0.045)" },
    { id: "sunrise", name: "Sunrise Rush", price: 90, note: "Warm arcade glow.", stops: ["#251727", "#171626", "#2d1f16"], line: "rgba(255, 209, 92, 0.06)" },
    { id: "mint", name: "Mint Night", price: 110, note: "Cool green motion.", stops: ["#10211e", "#101822", "#171b27"], line: "rgba(62, 226, 138, 0.06)" }
  ];

  const COIN_STYLES = [
    { id: "gold", name: "Gold Coins", price: 0, note: "Classic coin sparkle.", fill: "#ffd15c", rim: "#fff0a8" },
    { id: "ruby", name: "Ruby Coins", price: 70, note: "Red bonus drops.", fill: "#ff5a76", rim: "#ffd1dc" },
    { id: "aqua", name: "Aqua Coins", price: 100, note: "Cool blue rewards.", fill: "#4de8ff", rim: "#d8fbff" }
  ];

  const state = {
    mode: "ready",
    lastTime: 0,
    score: 0,
    best: readNumber(STORAGE.best, 0),
    wallet: readNumber(STORAGE.coins, 0),
    streak: 1,
    rotation: 0,
    targetRotation: 0,
    drop: null,
    nextDrop: null,
    speed: 292,
    spawnDelay: 0,
    shake: 0,
    muted: false,
    paletteId: readString(STORAGE.palette, "classic"),
    backgroundId: readString(STORAGE.background, "midnight"),
    coinId: readString(STORAGE.coin, "gold"),
    ownedPalettes: readList(STORAGE.ownedPalettes, ["classic"]),
    ownedBackgrounds: readList(STORAGE.ownedBackgrounds, ["midnight"]),
    ownedCoins: readList(STORAGE.ownedCoins, ["gold"]),
    particles: [],
    floats: [],
    flashes: []
  };

  const poki = createPokiBridge();
  ensureValidUnlocks();
  updateHud();
  renderShop();

  function readNumber(key, fallback) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function readString(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function readList(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(parsed) ? [...new Set([...fallback, ...parsed])] : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    } catch {
      // Device storage is optional for Poki builds.
    }
  }

  function ensureValidUnlocks() {
    if (!PALETTES.some((item) => item.id === state.paletteId)) state.paletteId = "classic";
    if (!BACKGROUNDS.some((item) => item.id === state.backgroundId)) state.backgroundId = "midnight";
    if (!COIN_STYLES.some((item) => item.id === state.coinId)) state.coinId = "gold";
    for (const id of ["classic"]) if (!state.ownedPalettes.includes(id)) state.ownedPalettes.push(id);
    for (const id of ["midnight"]) if (!state.ownedBackgrounds.includes(id)) state.ownedBackgrounds.push(id);
    for (const id of ["gold"]) if (!state.ownedCoins.includes(id)) state.ownedCoins.push(id);
  }

  function palette() {
    return PALETTES.find((item) => item.id === state.paletteId) || PALETTES[0];
  }

  function colors() {
    return palette().colors;
  }

  function background() {
    return BACKGROUNDS.find((item) => item.id === state.backgroundId) || BACKGROUNDS[0];
  }

  function coinStyle() {
    return COIN_STYLES.find((item) => item.id === state.coinId) || COIN_STYLES[0];
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
    state.floats.length = 0;
    state.flashes.length = 0;
    state.nextDrop = makeNextDrop();
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
    coinsEl.textContent = String(state.wallet);
    shopWallet.textContent = `${state.wallet} coins`;
  }

  function makeNextDrop() {
    if (state.score >= 2 && Math.random() < 0.22) {
      return { kind: "coin", value: 5 + Math.floor(Math.random() * 6) };
    }
    return { kind: "block", color: Math.floor(Math.random() * colors().length) };
  }

  function spawnDrop() {
    const next = state.nextDrop || makeNextDrop();
    state.nextDrop = makeNextDrop();
    state.drop = {
      ...next,
      x: canvas.width / 2,
      y: -58,
      size: next.kind === "coin" ? 58 : 66,
      angle: Math.random() * Math.PI,
      spin: (Math.random() > 0.5 ? 1 : -1) * (1.1 + Math.random() * 0.9)
    };
  }

  function rotateSquare() {
    if (shopPanel && !shopPanel.classList.contains("hidden")) return;
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
      save(STORAGE.best, String(state.best));
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
    state.score += state.streak;
    state.streak = Math.min(9, state.streak + 1);
    state.speed = Math.min(570, state.speed + 7);
    state.flashes.push({ life: 0.16, color: colors()[state.drop.color].glow });
    burst(canvas.width / 2, impactY(), colors()[state.drop.color].value, 28);
    playTone(520 + state.streak * 38, 0.05, "sine", 0.035);
    clearDrop(0.34 - state.score * 0.004);
    updateHud();
  }

  function collectCoin() {
    const value = state.drop.value;
    state.wallet += value;
    save(STORAGE.coins, String(state.wallet));
    state.floats.push({ text: `+${value}`, x: canvas.width / 2, y: impactY() - 12, life: 0.85 });
    burst(canvas.width / 2, impactY(), coinStyle().fill, 24);
    playTone(760 + value * 16, 0.07, "square", 0.025);
    clearDrop(0.18);
    updateHud();
    renderShop();
  }

  function clearDrop(delay) {
    state.drop = null;
    state.spawnDelay = Math.max(0.1, delay);
  }

  function topColorIndex() {
    const quarterTurns = Math.round(state.targetRotation / (Math.PI / 2));
    return ((quarterTurns % colors().length) + colors().length) % colors().length;
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

    for (let index = state.floats.length - 1; index >= 0; index -= 1) {
      const float = state.floats[index];
      float.life -= dt;
      float.y -= 74 * dt;
      if (float.life <= 0) state.floats.splice(index, 1);
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
      if (state.drop.kind === "coin") {
        collectCoin();
      } else if (state.drop.color === topColorIndex()) {
        scoreHit();
      } else {
        state.streak = 1;
        burst(canvas.width / 2, impactY(), "#f6f7fb", 34);
        updateHud();
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
    drawFloats();
    ctx.restore();
  }

  function drawBackground() {
    const bg = background();
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, bg.stops[0]);
    gradient.addColorStop(0.54, bg.stops[1]);
    gradient.addColorStop(1, bg.stops[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = bg.line;
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
      ctx.shadowColor = colors()[index].glow;
      ctx.strokeStyle = colors()[index].value;
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
    ctx.save();
    ctx.translate(drop.x, drop.y);
    ctx.rotate(drop.angle);
    if (drop.kind === "coin") {
      drawCoin(0, 0, drop.size / 2);
    } else {
      const color = colors()[drop.color];
      ctx.shadowBlur = 26;
      ctx.shadowColor = color.glow;
      ctx.fillStyle = color.value;
      roundRect(-drop.size / 2, -drop.size / 2, drop.size, drop.size, 12);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
      roundRect(-drop.size * 0.25, -drop.size * 0.28, drop.size * 0.24, drop.size * 0.16, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCoin(x, y, radius) {
    const style = coinStyle();
    ctx.save();
    ctx.shadowBlur = 26;
    ctx.shadowColor = style.fill;
    ctx.fillStyle = style.fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(4, radius * 0.16);
    ctx.strokeStyle = style.rim;
    ctx.stroke();
    ctx.fillStyle = "rgba(17, 23, 34, 0.32)";
    ctx.font = `900 ${Math.max(20, radius * 0.92)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", x, y + radius * 0.04);
    ctx.restore();
  }

  function drawNext() {
    const next = state.nextDrop || { kind: "block", color: 0 };
    const x = canvas.width - 92;
    const y = 80;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    roundRect(x - 44, y - 42, 88, 84, 8);
    ctx.fill();
    if (next.kind === "coin") {
      drawCoin(x, y + 10, 21);
    } else {
      const color = colors()[next.color];
      ctx.fillStyle = color.value;
      ctx.shadowColor = color.glow;
      ctx.shadowBlur = 18;
      roundRect(x - 20, y - 10, 40, 40, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
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

  function drawFloats() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 34px system-ui, sans-serif";
    for (const float of state.floats) {
      ctx.globalAlpha = Math.max(0, float.life / 0.85);
      ctx.fillStyle = coinStyle().rim;
      ctx.fillText(float.text, float.x, float.y);
    }
    ctx.restore();
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

  function renderShop() {
    renderShopGroup(paletteShop, PALETTES, "palette");
    renderShopGroup(backgroundShop, BACKGROUNDS, "background");
    renderShopGroup(coinShop, COIN_STYLES, "coin");
    updateHud();
  }

  function renderShopGroup(container, items, type) {
    container.replaceChildren(...items.map((item) => {
      const owned = ownedList(type).includes(item.id);
      const selected = selectedId(type) === item.id;
      const article = document.createElement("article");
      article.className = "shop-item";

      const swatches = document.createElement("div");
      swatches.className = "swatches";
      swatchColors(item, type).forEach((color) => {
        const swatch = document.createElement("i");
        swatch.style.background = color;
        swatches.append(swatch);
      });

      const name = document.createElement("strong");
      name.textContent = item.name;
      const note = document.createElement("small");
      note.textContent = item.note;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = selected ? "Selected" : owned ? "Use" : `${item.price} coins`;
      button.disabled = selected || (!owned && state.wallet < item.price);
      button.addEventListener("click", () => buyOrSelect(type, item));

      article.append(swatches, name, note, button);
      return article;
    }));
  }

  function swatchColors(item, type) {
    if (type === "palette") return item.colors.map((color) => color.value);
    if (type === "background") return item.stops;
    return [item.fill, item.rim];
  }

  function ownedList(type) {
    if (type === "palette") return state.ownedPalettes;
    if (type === "background") return state.ownedBackgrounds;
    return state.ownedCoins;
  }

  function selectedId(type) {
    if (type === "palette") return state.paletteId;
    if (type === "background") return state.backgroundId;
    return state.coinId;
  }

  function setSelected(type, id) {
    if (type === "palette") {
      state.paletteId = id;
      save(STORAGE.palette, id);
    } else if (type === "background") {
      state.backgroundId = id;
      save(STORAGE.background, id);
    } else {
      state.coinId = id;
      save(STORAGE.coin, id);
    }
  }

  function saveOwned(type) {
    if (type === "palette") save(STORAGE.ownedPalettes, state.ownedPalettes);
    if (type === "background") save(STORAGE.ownedBackgrounds, state.ownedBackgrounds);
    if (type === "coin") save(STORAGE.ownedCoins, state.ownedCoins);
  }

  function buyOrSelect(type, item) {
    const owned = ownedList(type);
    if (!owned.includes(item.id)) {
      if (state.wallet < item.price) return;
      state.wallet -= item.price;
      owned.push(item.id);
      save(STORAGE.coins, String(state.wallet));
      saveOwned(type);
      playTone(880, 0.08, "triangle", 0.025);
    }
    setSelected(type, item.id);
    renderShop();
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
  shopButton.addEventListener("click", () => {
    if (state.mode === "playing") pauseGame();
    renderShop();
    shopPanel.classList.remove("hidden");
  });
  shopClose.addEventListener("click", () => shopPanel.classList.add("hidden"));
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
    if (event.code === "Escape") shopPanel.classList.add("hidden");
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
        wallet: state.wallet,
        streak: state.streak,
        hasDrop: Boolean(state.drop),
        dropKind: state.drop?.kind || null,
        nextKind: state.nextDrop?.kind || null,
        palette: state.paletteId,
        background: state.backgroundId,
        coin: state.coinId,
        topColor: colors()[topColorIndex()].name
      }),
      forceCoinDrop(value = 7) {
        state.drop = { kind: "coin", value, x: canvas.width / 2, y: impactY() - 12, size: 58, angle: 0, spin: 0 };
      },
      grantCoins(value) {
        state.wallet += value;
        save(STORAGE.coins, String(state.wallet));
        renderShop();
      }
    };
  });
  requestAnimationFrame(frame);
})();
