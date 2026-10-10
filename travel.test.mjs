import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStations, fuelPrices } from "./server.mjs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const reported = new Date().toISOString();
const station = (price = {}) => ({
  id: "1",
  name: "Test",
  position: { lat: 33.6, lng: -117.8 },
  prices: [
    {
      fuelType: "2",
      price: 5,
      currency: "USD",
      unit: "gal",
      modified: reported,
      ...price,
    },
  ],
});
test("station prices reject stale, modeled, wrong currency/grade and unknown units", () => {
  assert.equal(normalizeStations({ stations: [station()] }, "2")[0].price, 5);
  for (const price of [
    { modified: "2020-01-01" },
    { errorMargin: 0.05 },
    { currency: "EUR" },
    { fuelType: "1" },
    { unit: "kg" },
    { price: 0 },
    { available: false },
    { modified: "not a date" },
  ])
    assert.equal(
      normalizeStations({ stations: [station(price)] }, "2").length,
      0,
    );
  assert.ok(
    Math.abs(
      normalizeStations(
        { stations: [station({ price: 1, unit: "l" })] },
        "2",
      )[0].price - 3.785411784,
    ) < 1e-9,
  );
});
test("missing API credential returns actionable error", async () => {
  const original = process.env.HERE_API_KEY;
  delete process.env.HERE_API_KEY;
  try {
    assert.equal(
      (await fuelPrices(new URL("http://localhost/api/fuel-prices"))).status,
      503,
    );
  } finally {
    if (original !== undefined) process.env.HERE_API_KEY = original;
  }
});
test("planner scales round-trip fuel by route and MPG and clears travel without origin", async () => {
  const source = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const part = source.slice(
    source.indexOf("const travelCache"),
    source.indexOf("async function loadTravel("),
  );
  const elements = {};
  const state = {
    origin: { lat: 33.6, lon: -117.8 },
    fuelType: "2",
    budget: { area: "a", mpg: 10, fuelPrice: 5, travelRate: 0.2 },
  };
  const context = {
    state,
    visible: [{ id: "a", lat: 33.7, lon: -117.7, distance: 5 }],
    $: (id) => (elements[id] ??= {}),
    save() {},
    safe: String,
    dateText: String,
    googleLink: () => "",
    AbortController,
    loadTravel() {},
  };
  vm.createContext(context);
  vm.runInContext(part + "syncTravel();", context);
  assert.equal(state.budget.travel, 6.5); // 13 fallback miles at $0.50 fuel per mile.
  vm.runInContext(
    "travelCache.set(travelKey,{status:'ready',miles:20,seconds:1200});syncTravel();",
    context,
  );
  assert.equal(state.budget.travel, 10);
  assert.equal(state.budget.fuelPrice, 5); // Use the entered fuel price.
  state.budget.mpg = 20;
  vm.runInContext("syncTravel()", context);
  assert.equal(state.budget.travel, 5);
  state.origin = null;
  vm.runInContext("syncTravel()", context);
  assert.equal(state.budget.travel, 0);
  assert.equal(elements.fuelPrice.readOnly, false);
});
