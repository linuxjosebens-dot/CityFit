import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright"
);
const browser = await chromium.launch({ headless: true });
const base = process.env.TEST_BASE_URL || "http://localhost:8080";
await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
try {
  // Opening the dialog must not depend on the authentication module loading.
  const blockedLogin = await browser.newPage();
  await blockedLogin.route("**/intro.js?*", (route) => route.abort());
  await blockedLogin.goto(
    new URL("./intro.html", base.endsWith("/") ? base : base + "/").href,
  );
  await blockedLogin.locator("#openLogin").click();
  assert.equal(await blockedLogin.locator("#authDialog").isVisible(), true);
  await blockedLogin.waitForFunction(() =>
    document
      .getElementById("authStatus")
      .textContent.includes("could not load"),
  );
  await blockedLogin.locator("#closeLogin").click();
  assert.equal(await blockedLogin.locator("#authDialog").isVisible(), false);
  await blockedLogin.close();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [];
    await page.route("**/auth-config.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "export const firebaseConfig = {};",
      }),
    );
    await page.route("**/api/parking-fee?**", (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        json: {
          amount: 12.5,
          status: "estimate",
          location: url.searchParams.get("location"),
          source: "Test Lot API",
          detail: "Test parking estimate.",
        },
      });
    });
    let livePrices = false;
    page.on("pageerror", (error) => errors.push(error.message));
    if (new URL(base).hostname.endsWith(".github.io")) {
      page.on("response", (response) => {
        if (
          new URL(response.url()).origin === new URL(base).origin &&
          response.status() >= 400
        )
          errors.push(`HTTP ${response.status()}: ${response.url()}`);
      });
      page.on("request", (request) => {
        if (
          new URL(request.url()).origin === new URL(base).origin &&
          new URL(request.url()).pathname.startsWith("/api/")
        )
          errors.push(
            `Unavailable static-host API requested: ${request.url()}`,
          );
      });
    }
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.abort(),
    );
    await page.route("https://photon.komoot.io/**", (route) =>
      route.fulfill({
        json: {
          features: [
            {
              geometry: {
                type: "Point",
                coordinates: [-117.8261275, 33.6859574],
              },
              properties: {
                countrycode: "US",
                housenumber: "1",
                street: "Civic Center Plaza",
                city: "Irvine",
                state: "California",
                postcode: "92606",
              },
            },
            {
              geometry: { type: "Point", coordinates: [-117.743, 33.65] },
              properties: {
                countrycode: "US",
                housenumber: "670",
                street: "Spectrum Center Drive",
                city: "Irvine",
                state: "California",
                postcode: "92618",
              },
            },
          ],
        },
      }),
    );
    let origin;
    await page.route("https://router.project-osrm.org/**", (route) => {
      const coordinates = new URL(route.request().url()).pathname
        .split("/")
        .pop()
        .split(";")
        .map((pair) => pair.split(",").map(Number));
      origin = coordinates[0];
      return route.fulfill({
        json: {
          code: "Ok",
          routes: [
            {
              distance: 32186.88,
              duration: 2400,
              geometry: { type: "LineString", coordinates },
            },
          ],
        },
      });
    });
    await page.route("**/api/fuel-prices?*", (route) =>
      livePrices
        ? route.fulfill({
            json: {
              stations: [
                {
                  name: "Nearest station",
                  id: "one",
                  lat: origin[1],
                  lon: origin[0],
                  price: 4.599,
                  modified: new Date().toISOString(),
                },
              ],
            },
          })
        : route.fulfill({ status: 503, json: { error: "Not configured" } }),
    );
    await page.route("https://overpass-api.de/**", (route) =>
      route.fulfill({ json: { elements: [] } }),
    );
    await page.goto(
      new URL("./intro.html", base.endsWith("/") ? base : base + "/").href,
    );
    await page.locator("#openLogin").click();
    assert.equal(await page.locator("#authDialog").isVisible(), true);
    assert.equal(await page.locator("#googleLogin").isDisabled(), true);
    await page.locator("#signUpTab").click();
    assert.equal(
      await page.locator("#emailLogin").textContent(),
      "Create account",
    );
    await page.locator("#closeLogin").click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: new URL(`./artifacts/intro-${viewport.width}.png`, import.meta.url)
        .pathname,
      fullPage: true,
    });
    await page.goto(
      new URL("./index.html", base.endsWith("/") ? base : base + "/").href,
    );
    await page.waitForFunction(() =>
      document.getElementById("catalogStamp").textContent.includes("Snapshot"),
    );
    assert.equal(await page.locator(".venue-card").count(), 0);
    assert.equal(await page.locator("#exportPlan").isDisabled(), true);
    await page.locator("[data-start]").click();
    assert.equal(
      await page
        .locator("#startAddress")
        .evaluate((e) => document.activeElement === e),
      true,
    );
    for (const id of ["heroPlan", "sidePlan"]) {
      if (!(await page.locator(`#${id}`).isVisible())) continue;
      await page.locator(`#${id}`).click();
      assert.equal(await page.locator("#budgetForm").isVisible(), true);
      await page.locator("#plannerLocation").click();
      assert.equal(await page.locator("#startAddress").isVisible(), true);
    }
    await page.locator("#exampleOrigin").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".venue-card").length === 10,
    );
    const savedId = await page
      .locator("[data-save]")
      .first()
      .getAttribute("data-save");
    await page.locator(`[data-save="${savedId}"]`).click();
    assert.equal(await page.locator("#savedCount").textContent(), "1");
    await page.locator("#savedOnly").check();
    assert.equal(await page.locator(".venue-card").count(), 1);
    await page.locator(`[data-save="${savedId}"]`).click();
    assert.equal(await page.locator(".venue-card").count(), 0);
    await page.locator("#savedOnly").uncheck();
    await page.locator("#resetMap").click();
    await page.locator("#refreshPlaces").click();
    await page.waitForFunction(
      () => !document.getElementById("refreshPlaces").disabled,
    );
    await page.locator("#clearOrigin").click();
    // Native browser permission denial must recover without inventing an origin.
    await context.clearPermissions();
    await page.locator("#useLocation").click();
    await page.waitForFunction(() =>
      document
        .getElementById("addressStatus")
        .textContent.includes("permission was denied"),
    );
    assert.equal(await page.locator("#useLocation").isEnabled(), true);
    assert.equal(await page.locator("#startAddress").inputValue(), "");
    await context.setGeolocation({
      latitude: 33.6859574,
      longitude: -117.8261275,
      accuracy: 10,
    });
    await context.grantPermissions(["geolocation"], {
      origin: new URL(base).origin,
    });
    let currentLocationLookups = 0;
    page.on("request", (request) => {
      if (request.url().includes("photon.komoot.io")) currentLocationLookups++;
    });
    await page.locator("#useLocation").click();
    await page.waitForFunction(
      () =>
        document.getElementById("startAddress").value === "My current location",
    );
    await page.locator("#findAddress").evaluate((button) => button.click());
    await page.waitForFunction(() =>
      document.getElementById("addressStatus").textContent.startsWith("Using "),
    );
    assert.equal(currentLocationLookups, 0);
    const deviceOrigin = await page.evaluate(
      () => JSON.parse(localStorage.getItem("city-fit-irvine-v1")).origin,
    );
    assert.equal(deviceOrigin.lat, 33.6859574);
    assert.equal(deviceOrigin.lon, -117.8261275);
    assert.match(deviceOrigin.precision, /Device location/);
    assert.equal(await page.locator(".leaflet-marker-icon").count(), 11);

    assert.equal(await page.locator("#addressSuggestions").isHidden(), true);
    assert.match(
      await page.locator("#addressStatus").textContent(),
      /Using My current location/,
    );
    await page.locator("#clearOrigin").click();
    await page.locator("#startAddress").fill("Costa");
    await page.locator("#address-option-0").waitFor();
    await page.locator("#startAddress").fill("1 Civic Center Plaza Irvine");
    await page.locator("#findAddress").click();
    await page.locator("#address-option-0").waitFor();
    await page.locator("#startAddress").press("ArrowDown");
    await page.locator("#startAddress").press("Enter");
    await page.waitForFunction(
      () => document.querySelectorAll(".venue-card").length === 10,
    );
    assert.equal(
      await page
        .locator("#mapTitle")
        .evaluate((e) => document.activeElement === e),
      true,
    );
    assert.ok(
      await page
        .locator(".map-panel")
        .evaluate((e) => Math.abs(e.getBoundingClientRect().top) < 180),
    );
    assert.equal(await page.locator(".leaflet-marker-icon").count(), 11);
    assert.equal(
      await page.locator(".venue-card .location-map-links a").count(),
      20,
    );
    assert.match(
      await page.locator("#catalogStamp").innerText(),
      /Mapped Parking · Partial Irvine Coverage Snapshot/,
    );
    assert.match(
      await page.locator("#trafficStamp").innerText(),
      /City Vehicle Counts · 2022 Measurement Year · Saved Snapshot/,
    );
    await page
      .locator('.venue-card [data-map-provider="google"]')
      .first()
      .click();
    assert.equal(
      await page.locator("#mapAccountDialog").evaluate((e) => e.open),
      true,
    );
    const accountURL = new URL(
      await page.locator("#mapAccountSignIn").getAttribute("href"),
    );
    assert.equal(accountURL.hostname, "accounts.google.com");
    assert.equal(
      accountURL.searchParams.get("continue"),
      await page.locator("#mapAccountContinue").getAttribute("href"),
    );
    await page.locator("#closeMapAccount").click();
    await page
      .locator('.venue-card [data-map-provider="apple"]')
      .first()
      .click();
    assert.match(
      await page.locator("#mapAccountDescription").innerText(),
      /Apple Account configured in Settings/,
    );
    assert.equal(
      new URL(await page.locator("#mapAccountContinue").getAttribute("href"))
        .hostname,
      "maps.apple.com",
    );
    await page.keyboard.press("Escape");
    const googleURL = new URL(
      await page
        .locator(".venue-card .location-map-links a")
        .first()
        .getAttribute("href"),
    );
    assert.equal(googleURL.hostname, "www.google.com");
    assert.ok(googleURL.searchParams.get("destination"));
    assert.equal(
      new URL(
        await page
          .locator(".venue-card .location-map-links a")
          .nth(1)
          .getAttribute("href"),
      ).hostname,
      "maps.apple.com",
    );
    assert.equal(
      await page
        .locator(".eyebrow")
        .first()
        .evaluate((e) => getComputedStyle(e).textTransform),
      "none",
    );

    assert.equal(
      (await page.locator("#discoveryMap svg path").count()) > 0,
      true,
    );
    await page.locator("[data-plan]").first().click();
    await page.waitForFunction(() =>
      document
        .getElementById("travelSummary")
        .textContent.includes("20.0 round-trip"),
    );
    assert.equal(
      await page.locator("#parkingFee, #fee, .business-settings").count(),
      0,
    );
    await page.locator("#fuelPrice").fill("0");
    assert.equal(
      await page.locator("#fuelPrice").evaluate((e) => e.validity.valid),
      true,
    );
    await page.locator("#fuelPrice").fill("4");
    await page.locator("#fuelPrice").press("End");
    await page.locator("#fuelPrice").press(".");
    await page.locator("#fuelPrice").press("5");
    await page.locator("#fuelPrice").press("9");
    assert.equal(await page.locator("#fuelPrice").inputValue(), "4.59");
    assert.equal(await page.locator("#travel").inputValue(), "9.18");
    await page.locator("#orders").fill("");
    const alternate = await page
      .locator("#budgetArea option")
      .nth(1)
      .getAttribute("value");
    await page.locator("#budgetArea").selectOption(alternate);
    assert.equal(
      await page.locator(".venue-card.selected").getAttribute("id"),
      "card-" + alternate,
    );
    await page.locator("#orders").fill("80");
    // A saved zero survives a reload, regardless of asynchronous route completion.
    await page.locator("#fuelPrice").fill("0");
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".venue-card").length === 10,
    );
    await page.locator('[data-view="planner"]').click();
    assert.equal(await page.locator("#fuelPrice").inputValue(), "0");
    await page.locator("#fuelPrice").fill("4.599");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#exportPlan").click();
    const download = await downloadPromise;
    const text = await readFile(await download.path(), "utf8");
    assert.equal(
      download.suggestedFilename(),
      "city-fit-irvine-shift-plan.pdf",
    );
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.ok(text.includes("$4.60/gal"));
    await page.locator("#logArea").selectOption(alternate);
    await page.locator("#logOrders").fill("100");
    await page.locator("#logHours").fill("2");
    await page.locator('#logForm button[type="submit"]').click();
    assert.equal(await page.locator(".logentry").count(), 1);
    const csvPromise = page.waitForEvent("download");
    await page.locator("#exportLog").click();
    const csv = await csvPromise;
    assert.equal(csv.suggestedFilename(), "city-fit-irvine-shift-log.csv");
    assert.ok((await readFile(await csv.path(), "utf8")).includes("100"));
    assert.equal(await page.locator("#orders").inputValue(), "150");
    assert.equal(
      await page.locator("#orders").evaluate((e) => e.readOnly),
      true,
    );
    assert.match(
      await page.locator("#ordersStatus").innerText(),
      /Automatic Estimate/,
    );
    await page.locator('[data-view="locations"]').click();
    await page.locator("#sortAreas").selectOption("history");
    assert.equal(
      await page.locator(".venue-card").first().getAttribute("id"),
      "card-" + alternate,
    );
    await page.locator("[data-detail]").first().click();
    await page.locator("#detailDialog[open]").waitFor();
    assert.equal(
      await page
        .locator(
          '#detailDialog a[href*="google.com/maps"], #detailDialog a[href*="maps.apple.com"]',
        )
        .count(),
      0,
    );

    assert.ok(
      (await page.locator("#detailContent").innerText()).includes(
        "recorded shift performance",
      ),
    );
    assert.equal(await page.locator("#detailApproval").count(), 0);
    await page.locator("#closeDetail").click();
    await page.locator('[data-view="permits"]').click();
    assert.equal(await page.locator("#approvalStatus").count(), 0);
    assert.equal(await page.locator(".lot-permit-card").count(), 1);
    const expectedLotName = await page
      .locator("#budgetArea option:checked")
      .getAttribute("value");
    assert.equal(expectedLotName, alternate);
    assert.ok(
      (await page.locator("#permitLocationName").textContent()).length > 0,
    );
    await page.locator("#changePermitLocation").click();
    const otherLot = await page
      .locator("#budgetArea option")
      .first()
      .getAttribute("value");
    await page.locator("#budgetArea").selectOption(otherLot);
    await page.locator('[data-view="permits"]').click();
    assert.equal(await page.locator(".lot-permit-card").count(), 1);
    assert.equal(
      await page.locator(".lot-permit-card summary").textContent(),
      await page.locator("#permitLocationName").textContent(),
    );
    await page.locator('[data-view="locations"]').click();
    await page.screenshot({
      path: new URL(
        `./artifacts/release-${viewport.width}.png`,
        import.meta.url,
      ).pathname,
      fullPage: true,
    });
    await page.locator('[data-view="planner"]').click();
    livePrices = true;
    await page.locator("#fuelType").selectOption("1");
    assert.equal(
      await page.locator("#fuelPrice").evaluate((e) => e.readOnly),
      false,
    );
    assert.equal(await page.locator("#fuelStations").count(), 0);
    assert.equal(await page.locator("#fuelPrice").inputValue(), "4.599");
    await page.locator('[data-view="locations"]').click();
    await page
      .locator("#startAddress")
      .fill("670 Spectrum Center Drive Irvine");
    await page.locator("#findAddress").click();
    await page.locator("#address-option-1").waitFor();
    await page.locator("#startAddress").press("ArrowUp");
    await page.locator("#startAddress").press("Enter");
    assert.ok(
      (await page.locator("#startAddress").inputValue()).includes("Spectrum"),
    );
    await page.locator("#venueCategory").selectOption("campus");
    await page.locator("#mileRadius").fill("10");
    assert.equal(
      await page.locator(".leaflet-marker-icon").count(),
      (await page.locator(".venue-card").count()) + 1,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.locator("#clearOrigin").click();
    assert.equal(await page.locator(".venue-card").count(), 0);
    assert.equal(await page.locator(".leaflet-marker-icon").count(), 0);
    await page.locator('[data-view="data"]').click();
    const googleSignIn = page.getByRole("link", {
      name: "Sign in to Google Maps ↗",
      exact: true,
    });
    const login = new URL(await googleSignIn.getAttribute("href"));
    assert.equal(login.origin, "https://accounts.google.com");
    assert.equal(login.pathname, "/AccountChooser");
    assert.equal(
      login.searchParams.get("continue"),
      "https://www.google.com/maps",
    );
    assert.equal(await googleSignIn.getAttribute("target"), "_blank");
    assert.equal(
      await page
        .getByRole("link", { name: "Open Apple Maps ↗", exact: true })
        .getAttribute("href"),
      "https://maps.apple.com/",
    );
    assert.equal(
      await page
        .getByRole("link", {
          name: "Apple Account sign-in help ↗",
          exact: true,
        })
        .getAttribute("href"),
      "https://support.apple.com/en-us/111001",
    );
    assert.equal(
      await page
        .locator("#providerConnections")
        .getByText("Account Not Connected", { exact: true })
        .count(),
      0,
    );

    for (const [kind, key] of [
      ["parking", "elements"],
      ["catalog", "places"],
      ["traffic", "historicalRecords"],
    ]) {
      const snapshot = JSON.parse(
        await readFile(
          new URL(`./${kind}-snapshot.json`, import.meta.url),
          "utf8",
        ),
      );
      await page.locator(`[data-dataset="${kind}"]`).click();
      await page.waitForFunction(
        () => !document.getElementById("datasetSearch").disabled,
      );
      assert.equal(await page.locator("#datasetDialog").isVisible(), true);
      assert.equal(
        await page.locator("#datasetBody tr").count(),
        snapshot[key].length,
      );
      await page.locator("#datasetSearch").fill("no-such-record-123xyz");
      assert.equal(
        await page.locator("#datasetCount").textContent(),
        `0 of ${snapshot[key].length} records`,
      );
      await page.locator("#datasetSearch").fill("");
      const datasetDownload = page.waitForEvent("download");
      await page.locator("#datasetDownload").click();
      const datasetFile = await datasetDownload;
      assert.equal(datasetFile.suggestedFilename(), `${kind}-snapshot.json`);
      const downloaded = JSON.parse(
        await readFile(await datasetFile.path(), "utf8"),
      );
      assert.equal(downloaded[key].length, snapshot[key].length);
      await page.locator("#closeDataset").click();
      assert.equal(await page.locator("#datasetDialog").isVisible(), false);
    }
    await page.locator("#sourceLog").click();
    assert.equal(await page.locator("#budgetForm").isVisible(), true);
    await page.locator("[data-remove]").click();
    assert.equal(await page.locator(".logentry").count(), 0);
    await page.locator('[data-view="permits"]').click();
    const check = page.locator("[data-check]").first();
    await check.check();
    await page.reload();
    await page.locator('[data-view="permits"]').click();
    assert.equal(await check.isChecked(), true);
    await check.uncheck();
    assert.deepEqual(errors, []);
    console.log(`Passed browser workflows at ${viewport.width}px`);
    await context.close();
  }
} finally {
  await browser.close();
}
