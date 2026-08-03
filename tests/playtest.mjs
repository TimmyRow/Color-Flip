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

async function withPage(browser, profile, fn) {
  const context = await browser.newContext(profile);
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
    await page.locator("#flip").dispatchEvent("pointerdown", { pointerType: "touch", button: 0 });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(state.mode === "playing", `${profile.name} game did not stay playable`);
    expect(state.hasDrop, `${profile.name} no falling block spawned`);

    const walletBefore = state.wallet;
    await page.evaluate(() => window.__colorFlipDebug.forceCoinDrop(8));
    await page.waitForTimeout(140);
    const afterCoin = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(afterCoin.wallet === walletBefore + 8, `${profile.name} coin did not collect on any color`);

    await page.evaluate(() => window.__colorFlipDebug.grantCoins(320));
    await page.locator("#shop").click();
    await page.locator(".shop-item", { hasText: "Neon Circuit" }).locator("button").click();
    await page.locator(".shop-item", { hasText: "Sunrise Rush" }).locator("button").click();
    await page.locator(".shop-item", { hasText: "Ruby Coins" }).locator("button").click();
    await page.locator("#shopClose").click();
    const afterShop = await page.evaluate(() => window.__colorFlipDebug.getState());
    expect(afterShop.palette === "neon", `${profile.name} palette purchase did not equip`);
    expect(afterShop.background === "sunrise", `${profile.name} background purchase did not equip`);
    expect(afterShop.coin === "ruby", `${profile.name} coin purchase did not equip`);
  });
  console.log(`PASS ${profile.name}`);
}

async function run() {
  const browser = await chromium.launch();
  try {
    for (const profile of profiles) {
      await runProfile(browser, profile);
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
