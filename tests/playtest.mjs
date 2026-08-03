import { chromium, devices } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const gameUrl = pathToFileURL(resolve("index.html")).href;

const profiles = [
  { name: "desktop", viewport: { width: 1280, height: 820 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: "iphone-portrait", ...devices["iPhone 14"] },
  { name: "iphone-landscape", ...devices["iPhone 14 landscape"] },
  { name: "ipad-portrait", ...devices["iPad Pro 11"] },
  { name: "ipad-landscape", ...devices["iPad Pro 11 landscape"] }
];

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function withPage(browser, profile, fn, options = {}) {
  const context = await browser.newContext(profile);
  if (options.blockStorage) {
    await context.addInitScript(() => {
      for (const method of ["getItem", "setItem", "removeItem"]) {
        Object.defineProperty(Storage.prototype, method, {
          configurable: true,
          value() {
            throw new Error("localStorage disabled by playtest");
          }
        });
      }
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await fn(page);
    expect(errors.length === 0, `${profile.name} errors: ${errors.join(" | ")}`);
  } finally {
    await context.close();
  }
}

async function storageBlockedFallback(browser) {
  await withPage(browser, devices["iPhone 14"], async (page) => {
    await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#game");
    await page.waitForFunction(() => Boolean(window.__colorFlipDebug));
    await page.locator("#play").click();
    await page.evaluate(() => window.__colorFlipDebug.forceCoinDrop(6));
    await page.waitForTimeout(160);
    const state = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(state.wallet === 6, `coin collection failed without localStorage: ${JSON.stringify(state)}`);
    await page.locator("#shop").click();
    expect(await page.locator("#shopPanel:not(.hidden)").count() === 1, "shop did not open without localStorage");
  }, { blockStorage: true });
  console.log("PASS storage-blocked fallback");
}

async function matchedColorRegression(browser) {
  await withPage(browser, profiles[0], async (page) => {
    await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#game");
    await page.waitForFunction(() => Boolean(window.__colorFlipDebug));
    await page.locator("#play").click();
    for (let turns = 0; turns < 4; turns += 1) {
      await page.evaluate((turnCount) => {
        window.__colorFlipDebug.rotateToTurns(turnCount);
        const topColorName = window.__colorFlipDebug.getState().topColor;
        const colorIndexByName = { red: 0, yellow: 1, blue: 2, green: 3 };
        window.__colorFlipDebug.forceBlockDrop(colorIndexByName[topColorName]);
      }, turns);
      await page.waitForTimeout(140);
      const state = await page.evaluate(() => window.__colorFlipDebug.getState());
      expect(state.mode === "playing", `matched color ended game at turn ${turns}: ${JSON.stringify(state)}`);
      expect(state.score > turns, `matched color did not score at turn ${turns}: ${JSON.stringify(state)}`);
    }
  });
  console.log("PASS matched-color regression");
}

async function repeatedColorRegression(browser) {
  await withPage(browser, profiles[0], async (page) => {
    await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#game");
    await page.waitForFunction(() => Boolean(window.__colorFlipDebug));
    const generated = await page.evaluate(() => window.__colorFlipDebug.generateBlockColors(400));
    const tripleIndex = generated.findIndex((color, index, list) => index >= 2 && color === list[index - 1] && color === list[index - 2]);
    expect(tripleIndex === -1, `same color appeared three times in a row at index ${tripleIndex}: ${generated.slice(Math.max(0, tripleIndex - 4), tripleIndex + 3).join(",")}`);
  });
  console.log("PASS repeated-color regression");
}

async function speedProgressionRegression(browser) {
  await withPage(browser, profiles[0], async (page) => {
    await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#game");
    await page.waitForFunction(() => Boolean(window.__colorFlipDebug));
    const speeds = await page.evaluate(() => ({
      start: window.__colorFlipDebug.speedFor(0, 1),
      early: window.__colorFlipDebug.speedFor(8, 3),
      mid: window.__colorFlipDebug.speedFor(18, 5),
      late: window.__colorFlipDebug.speedFor(40, 8)
    }));
    expect(speeds.early > speeds.start + 60, `early speed ramp too flat: ${JSON.stringify(speeds)}`);
    expect(speeds.mid > speeds.early + 95, `mid speed ramp too flat: ${JSON.stringify(speeds)}`);
    expect(speeds.late > speeds.mid, `late speed did not keep increasing: ${JSON.stringify(speeds)}`);
  });
  console.log("PASS speed progression regression");
}

async function runProfile(browser, profile) {
  await withPage(browser, profile, async (page) => {
    await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#game");

    const canvasVisible = await page.locator("#game").isVisible();
    expect(canvasVisible, `${profile.name} canvas is hidden`);
    await page.waitForFunction(() => Boolean(window.__colorFlipDebug));

    const fit = await page.evaluate(() => {
      return [...document.querySelectorAll("button, canvas, .stats")]
        .filter((element) => element.offsetParent !== null)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= -2 && rect.top >= -2 && rect.right <= innerWidth + 2 && rect.bottom <= innerHeight + 2;
        })
        .every(Boolean);
    });
    expect(fit, `${profile.name} controls overflow viewport`);

    await page.waitForFunction(() => {
      const canvas = document.querySelector("#game");
      const context = canvas.getContext("2d");
      const points = [
        [canvas.width / 2, canvas.height / 2],
        [canvas.width / 2, canvas.height * 0.68],
        [canvas.width * 0.35, canvas.height * 0.35]
      ];
      return points.some(([x, y]) => context.getImageData(x, y, 1, 1).data[3] > 0);
    }, null, { timeout: 3000 });

    await page.locator("#play").click();
    await page.waitForFunction(() => window.__colorFlipDebug?.getState().mode === "playing");
    await page.locator("#game").dispatchEvent("pointerdown", { pointerType: "touch", button: 0 });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(state.mode === "playing", `${profile.name} game did not stay playable`);
    expect(state.hasDrop, `${profile.name} no falling block spawned`);

    const walletBefore = state.wallet;
    await page.evaluate(() => window.__colorFlipDebug.forceCoinDrop(8));
    await page.waitForTimeout(140);
    const afterCoin = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(afterCoin.wallet === walletBefore + 8, `${profile.name} coin did not collect on any color`);

    await page.evaluate(() => window.__colorFlipDebug.grantCoins(700));
    await page.locator("#shop").click();
    await page.locator(".shop-item", { hasText: "Neon Circuit" }).locator("button").click();
    await page.locator(".shop-item", { hasText: "Sunrise Rush" }).locator("button").click();
    await page.locator(".shop-item", { hasText: "Ruby Coins" }).locator("button").click();
    await page.locator(".shop-item", { hasText: "Sharp Blocks" }).locator("button").click();
    await page.locator(".shop-item", { hasText: "Glow Rings" }).locator("button").click();
    await page.locator("#shopClose").click();
    const afterShop = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(afterShop.palette === "neon", `${profile.name} palette purchase did not equip`);
    expect(afterShop.background === "sunrise", `${profile.name} background purchase did not equip`);
    expect(afterShop.coin === "ruby", `${profile.name} coin purchase did not equip`);
    expect(afterShop.block === "sharp", `${profile.name} block purchase did not equip`);
    expect(afterShop.effect === "rings", `${profile.name} effect purchase did not equip`);
  });
  console.log(`PASS ${profile.name}`);
}

async function missionAndReviveRegression(browser) {
  await withPage(browser, profiles[0], async (page) => {
    await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#game");
    await page.waitForFunction(() => Boolean(window.__colorFlipDebug));
    await page.evaluate(() => window.__colorFlipDebug.resetMissions());
    const before = await page.evaluate(() => window.__colorFlipDebug.getState().wallet);
    await page.evaluate(() => window.__colorFlipDebug.forceMissionProgress("score", 15));
    const afterMission = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(afterMission.wallet === before + 25, `mission reward did not pay: ${JSON.stringify(afterMission)}`);

    await page.locator("#play").click();
    await page.evaluate(() => {
      window.__colorFlipDebug.rotateToTurns(0);
      window.__colorFlipDebug.forceBlockDrop(0);
    });
    await page.waitForTimeout(160);
    await page.evaluate(() => window.__colorFlipDebug.forceBlockDrop((window.__colorFlipDebug.getState().topColor === "red") ? 1 : 0));
    await page.waitForTimeout(160);
    const over = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(over.mode === "over", `forced miss did not end game: ${JSON.stringify(over)}`);
    await page.locator("#revive").click();
    const revived = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(revived.mode === "playing" && revived.revived, `revive did not continue play: ${JSON.stringify(revived)}`);
  });
  console.log("PASS mission and revive regression");
}

async function run() {
  const browser = await chromium.launch();
  try {
    for (const profile of profiles) {
      await runProfile(browser, profile);
    }
    await storageBlockedFallback(browser);
    await matchedColorRegression(browser);
    await repeatedColorRegression(browser);
    await speedProgressionRegression(browser);
    await missionAndReviveRegression(browser);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
