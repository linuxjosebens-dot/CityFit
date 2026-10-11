import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.TEST_BASE_URL || "http://localhost:8095";
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [],
      requests = [];
    let fail = false;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/auth-config.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: "export const firebaseConfig = {};",
      }),
    );
    await page.route("**/provider-config.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: 'export const providerApiBase="https://api.cityfit.test";',
      }),
    );
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("https://api.cityfit.test/api/location/status", (r) =>
      r.fulfill({
        json: {
          google: true,
          apple: true,
          googleRoutes: false,
          appleRoutes: false,
        },
      }),
    );
    await page.route("https://api.cityfit.test/api/location/places?**", (r) => {
      const url = new URL(r.request().url());
      requests.push(url);
      const provider = url.searchParams.get("provider");
      return fail
        ? r.fulfill({ status: 502, json: { error: "Provider unavailable" } })
        : r.fulfill({
            json: {
              status: "fresh",
              fetchedAt: new Date().toISOString(),
              places: [
                {
                  id: provider + "-live",
                  name:
                    provider === "google"
                      ? "Live Google Parking"
                      : "Live Apple Parking",
                  lat: 33.6859574,
                  lon: -117.8261275,
                  category: "community",
                  address: "Irvine CA",
                  source: provider === "google" ? "Google Maps" : "Apple Maps",
                  sourceId: provider,
                  sourceURL:
                    provider === "google"
                      ? "https://www.google.com/maps"
                      : "https://maps.apple.com/",
                  googleId: provider === "google" ? "google-live" : null,
                  rating: provider === "google" ? 4.5 : null,
                  reviewCount: provider === "google" ? 42 : null,
                  openNow: provider === "google" ? true : null,
                  attributions: [],
                  fetchedAt: new Date().toISOString(),
                },
              ],
            },
          });
    });
    await page.goto(base + "/index.html");
    await page.waitForFunction(
      () =>
        !document.querySelector("#placeProvider option[value=google]").disabled,
    );
    await page.locator("#exampleOrigin").click();
    for (const provider of ["google", "apple"]) {
      await page.locator("#placeProvider").selectOption(provider);
      await page.waitForFunction(
        (p) =>
          document
            .querySelector(".venue-title")
            ?.textContent.includes(
              p === "google" ? "Live Google" : "Live Apple",
            ),
        provider,
      );
      assert.equal(await page.locator("#discoveryMap").isHidden(), true);
      assert.equal(await page.locator("#providerMapHandoff").isVisible(), true);
      assert.equal(await page.locator(".venue-card").count(), 1);
      if (provider === "google")
        assert.match(
          await page.locator(".venue-card").innerText(),
          /42 Google Reviews/,
        );
      assert.ok(
        !(await page
          .locator(".venue-card")
          .innerText()
          .then((t) => t.includes("NaN"))),
      );
    }
    fail = true;
    await page.locator("#refreshPlaces").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#resultDescription")
        .textContent.includes("source is unavailable"),
    );
    assert.equal(await page.locator("#refreshPlaces").isEnabled(), true);
    await page.locator("#placeProvider").selectOption("public");
    await page.waitForFunction(
      () => document.querySelectorAll(".venue-card").length > 0,
    );
    assert.equal(await page.locator("#discoveryMap").isVisible(), true);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.ok(
      requests.some((u) => u.searchParams.get("provider") === "google"),
    );
    assert.ok(requests.every((u) => u.searchParams.get("radius") === "15"));
    console.log(
      `Passed live provider search, attribution, API failures and fallback at ${width}px`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
