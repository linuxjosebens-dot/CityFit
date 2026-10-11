import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.TEST_BASE_URL || "http://localhost:8087";
const browser = await chromium.launch();
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/auth-config.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: "export const firebaseConfig = {};",
      }),
    );
    await page.goto(base + "/index.html");
    await page.waitForFunction(() =>
      document.querySelector("#catalogStamp").textContent.includes("Snapshot"),
    );
    await page.locator("#serviceStartDate").fill("2026-10-10");
    await page.locator("#serviceStartDate").dispatchEvent("change");
    await page.locator("#serviceEndDate").fill("2026-10-13");
    await page.locator("#serviceEndDate").dispatchEvent("change");
    await page.locator("#exampleOrigin").click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => window.cityfitTheme.setLight(theme === "light"),
        theme,
      );
      const check = async (selectors) => {
        const results = await page.evaluate((selectors) => {
          const rgb = (value) => value.match(/[\d.]+/g).map(Number);
          const luminance = (color) =>
            color
              .slice(0, 3)
              .map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          return selectors.flatMap((selector) =>
            [...document.querySelectorAll(selector)]
              .filter((el) => el.checkVisibility())
              .map((el) => {
                const foreground = rgb(getComputedStyle(el).color);
                let background = [255, 255, 255];
                const ancestors = [];
                for (let node = el; node; node = node.parentElement)
                  ancestors.unshift(node);
                for (const node of ancestors) {
                  const c = rgb(getComputedStyle(node).backgroundColor),
                    a = c[3] ?? 1;
                  background = c
                    .slice(0, 3)
                    .map((v, i) => v * a + background[i] * (1 - a));
                }
                const a = luminance(foreground),
                  b = luminance(background);
                return {
                  selector,
                  text: el.textContent.trim().slice(0, 45),
                  contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
                };
              }),
          );
        }, selectors);
        for (const result of results)
          assert.ok(
            result.contrast >= 4.5,
            `${theme} ${width}px ${JSON.stringify(result)}`,
          );
      };
      await check([
        ".calendar-header",
        ".calendar-weekdays span",
        ".calendar-day",
        ".service-strip label",
        ".gps-button",
        ".help",
        "#profileButton",
        ".venue-title",
        ".venue-rank",
        ".venue-why",
        ".venue-source a",
        ".evidence-pill",
        ".map-legend",
        ".leaflet-control-attribution",
      ]);
      await page.locator(".calendar-day:not(.selected)").first().hover();
      await check([".calendar-day:hover"]);
      await page.mouse.move(0, 0);
      if (theme === "dark")
        assert.equal(
          await page
            .locator(".service-date-picker")
            .evaluate((el) => getComputedStyle(el).backgroundColor),
          "rgb(34, 49, 59)",
        );
      await page.locator("[data-view='planner']").click();
      await check([
        "#planner label",
        "#planner .help",
        "#planner .scenario",
        "#surplus",
      ]);
      await page.locator("[data-view='permits']").click();
      await check(["#permits label", "#permits .help", "#permits h3"]);
      await page.locator("[data-view='data']").click();
      await check([".source h3", ".source p", ".badge"]);
      await page.locator("[data-view='locations']").click();
      await page.goto(base + "/intro.html");
      await check([
        ".wordmark",
        ".hero-copy p",
        ".preview-tag",
        ".preview-arrow",
        ".closing .button",
      ]);
      await page.locator("#openLogin").click();
      await check(["#authDialog label", ".auth-description", "#authStatus"]);
      await page.goto(base + "/privacy.html");
      await check(["body", "h1", "h2", "a"]);
      await page.goto(base + "/index.html");
      await page.waitForFunction(() =>
        document
          .querySelector("#catalogStamp")
          .textContent.includes("Snapshot"),
      );
    }
    console.log(
      `Passed light/dark calendar, labels, planner, permits, data and login contrast at ${width}px`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
