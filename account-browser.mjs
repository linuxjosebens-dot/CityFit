import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const base = process.env.TEST_BASE_URL || "http://localhost:8087";
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const errors = [],
      storageRequests = [];
    await context.route("**/firebase-app.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "export const getApps=()=>[];export const initializeApp=()=>({});export const getApp=()=>({});",
      }),
    );
    await context.route("**/firebase-auth.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
      const user={uid:"alice",displayName:"Alice Chen",email:"alice@example.com",emailVerified:true,providerData:[{providerId:"google.com"}],metadata:{creationTime:"2026-01-01T00:00:00Z"}};
      const auth={currentUser:user,authStateReady:async()=>{}};let listener;
      export const getAuth=()=>auth;
      export const onAuthStateChanged=(_,cb)=>{listener=cb;cb(auth.currentUser);};
      export const signOut=async()=>{auth.currentUser=null;listener(null);};
    `,
      }),
    );
    await context.route("https://tile.openstreetmap.org/**", (route) =>
      route.abort(),
    );
    await context.route("https://overpass-api.de/**", (route) =>
      route.fulfill({ json: { elements: [] } }),
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/firestore|cityfit-test/.test(request.url()))
        storageRequests.push(request.url());
    });
    await page.goto(base + "/index.html");
    await page.waitForFunction(
      () =>
        document.getElementById("profileButton").textContent === "Alice Chen",
    );
    await page.locator("#profileButton").click();
    assert.equal(
      await page.locator("#profileName").textContent(),
      "Alice Chen",
    );
    assert.equal(
      await page.locator("#accountEmail").textContent(),
      "alice@example.com",
    );
    assert.equal(
      await page.locator("#accountProvider").textContent(),
      "Google",
    );
    assert.equal(
      await page.locator("#profileVerified").textContent(),
      "Verified",
    );
    const bounds = await page.locator("#profileDialog").boundingBox();
    assert.ok(Math.abs(bounds.x + bounds.width - width) < 2);
    await page.keyboard.press("Escape");
    await page.locator("#exampleOrigin").click();
    await page.locator("[data-save]").first().click();
    await page.locator("#profileButton").click();
    assert.equal(await page.locator("#profileSavedCount").textContent(), "1");
    const shortcutGap = await page
      .locator(".profile-actions")
      .evaluate((el) => {
        const [planner, sources] = [...el.children].map((x) =>
          x.getBoundingClientRect(),
        );
        return sources.top - planner.bottom;
      });
    assert.ok(shortcutGap >= 12);
    await page.locator("[data-open-view='planner']").click();
    assert.equal(await page.locator("#profileDialog").isVisible(), false);
    assert.equal(await page.locator("#planner").isVisible(), true);
    assert.equal(new URL(page.url()).hash, "#planner");
    await page.locator("#profileButton").click();
    await page.locator("[data-open-view='data']").click();
    assert.equal(await page.locator("#data").isVisible(), true);
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector("#profileButton").textContent === "Alice Chen",
    );
    assert.equal(await page.locator("#data").isVisible(), true);
    await page.locator("#profileButton").click();

    await page.locator("#lightModeToggle").uncheck();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("cityfit-theme")),
      "dark",
    );
    await page.goto(base + "/intro.html");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(
      await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(16, 24, 32)",
    );
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator("#openLogin").click();
    await page.locator("#introAccount").waitFor();
    const accountGap = await page.locator(".account-actions").evaluate((el) => {
      const boxes = [...el.children].map((x) => x.getBoundingClientRect());
      return Math.min(
        boxes[1].top - boxes[0].bottom,
        boxes[2].top - boxes[1].bottom,
      );
    });
    assert.ok(accountGap >= 14);
    await page.locator("#introAccount a[href$='#planner']").click();
    await page.waitForFunction(
      () => !document.querySelector("#planner").hidden,
    );
    assert.equal(new URL(page.url()).hash, "#planner");

    await page.goto(base + "/index.html");
    await page.waitForFunction(
      () =>
        document.getElementById("profileButton").textContent === "Alice Chen",
    );
    await page.locator("#profileButton").click();
    assert.equal(await page.locator("#lightModeToggle").isChecked(), false);
    await page.locator("#lightModeToggle").check();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    await page.locator("#signOutAccount").click();
    await page.waitForFunction(
      () => document.getElementById("profileName").textContent === "Guest",
    );
    assert.equal(await page.locator("#profileGuest").isVisible(), true);
    assert.equal(await page.locator("#lightModeToggle").isVisible(), false);
    assert.equal(await page.locator("#profileSavedCount").textContent(), "1");
    assert.equal(
      JSON.parse(
        await page.evaluate(() => localStorage.getItem("city-fit-irvine-v1")),
      ).saved.length,
      1,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(storageRequests, []);
    assert.deepEqual(errors, []);
    console.log(
      `Passed right-side profile, Firebase sign-out and browser-only saving at ${width}px`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
