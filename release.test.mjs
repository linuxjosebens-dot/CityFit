import { test } from "node:test";
import assert from "node:assert/strict";
import { loadState } from "./app.js";
import { fuelPrices, server } from "./server.mjs";
function restored(value) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify(value) };
  try {
    return loadState();
  } finally {
    globalThis.localStorage = previous;
  }
}
test("saved state preserves zero and decimals while rejecting malformed entries", () => {
  const state = restored({
    budget: { fuelPrice: 0, labor: 180.5 },
    logs: [
      null,
      {
        id: "one",
        area: "parking-one",
        orders: 20,
        hours: 1,
        cuisine: "meals",
      },
      { id: "bad", area: "bad", orders: -5, hours: 0 },
    ],
    approvals: { bad: null, one: { status: "invalid", note: 123 } },
    saved: ["one", "one", null],
  });
  assert.equal(state.budget.fuelPrice, 0);
  assert.equal(state.budget.labor, undefined);
  assert.equal(state.budget.other, undefined);
  assert.equal(state.budget.travelRate, undefined);
  assert.equal(state.logs.length, 1);
  assert.deepEqual(state.saved, ["one"]);
  assert.equal(state.approvals.one.status, "unknown");
  assert.equal(restored([]).budget.mpg, 10);
  assert.equal(
    restored({ budget: { mpg: 0, ticket: 0, orders: Infinity } }).budget.mpg,
    1,
  );
});
test("fuel endpoint validates inputs and follows provider pagination", async () => {
  const oldKey = process.env.HERE_API_KEY,
    oldFetch = globalThis.fetch;
  process.env.HERE_API_KEY = "test-placeholder";
  let calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
    return {
      ok: true,
      json: async () => ({
        stations: [
          {
            id: "one",
            position: { lat: 33.6, lng: -117.8 },
            prices: [
              {
                fuelType: "2",
                currency: "USD",
                unit: "gal",
                price: 4.59,
                modified: new Date().toISOString(),
              },
            ],
          },
        ],
        hasMore: calls.length === 1,
        nextOffset: 1,
      }),
    };
  };
  try {
    const invalid = await fuelPrices(
      new URL("http://localhost/api/fuel-prices?bbox=,33.5,-117,33.6"),
    );
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 0);
    const result = await fuelPrices(
      new URL(
        "http://localhost/api/fuel-prices?bbox=-117.81,33.59,-117.79,33.61&fuelType=2",
      ),
    );
    assert.equal(result.status, 200);
    assert.equal(calls[1].searchParams.get("offset"), "1");
    assert.equal(result.body.stations[0].price, 4.59);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.HERE_API_KEY;
    else process.env.HERE_API_KEY = oldKey;
  }
});
test("server serves public assets, correct errors, and blocks private files and foreign origins", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const html = await fetch(base);
    assert.equal(html.status, 200);
    assert.equal(html.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await fetch(base + "/server.mjs")).status, 404);
    assert.equal((await fetch(base + "/.env")).status, 404);
    assert.equal((await fetch(base + "/not-found.json")).status, 404);
    assert.equal((await fetch(base, { method: "POST" })).status, 405);
    assert.equal(
      (
        await fetch(base + "/api/fuel-prices", {
          headers: { Origin: "https://other.example" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(base, { method: "HEAD" })).status, 200);
    assert.equal(
      (await (await fetch(base + "/api/location/status")).json()).google,
      false,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
