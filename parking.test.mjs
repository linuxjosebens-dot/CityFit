import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parkingPlaces } from "./parking-core.js";
import {
  parseAddressResults,
  rankLocations,
  shiftEvidence,
  calculateBudget,
} from "./location-core.js";
import { resolveCurrentLocation } from "./app.js";
const json = async (file) =>
  JSON.parse(await readFile(new URL(file, import.meta.url)));
const [snapshot, catalog, boundary, traffic] = await Promise.all(
  [
    "parking-snapshot.json",
    "catalog-snapshot.json",
    "irvine-boundary.json",
    "traffic-snapshot.json",
  ].map(json),
);
const places = parkingPlaces(
  snapshot,
  catalog.places,
  boundary,
  snapshot.fetchedAt,
);
const settings = {
  origin: { lat: 33.6859574, lon: -117.8261275, label: "City Hall" },
  radius: 15,
  sortBy: "history",
  category: "all",
  cuisine: "meals",
  logs: [],
};
test("mapped lots exclude private access, garages and explicit truck prohibitions", () => {
  const row = snapshot.elements.find((e) => e.id === 227720878);
  assert.ok(row);
  for (const tags of [
    { access: "private" },
    { access: "no" },
    { hgv: "no" },
    { hgv: "private" },
    { parking: "multi-storey" },
    { motor_vehicle: "no" },
    { motorcar: "no" },
  ])
    assert.equal(
      parkingPlaces(
        { elements: [{ ...row, tags: { ...row.tags, ...tags } }] },
        catalog.places,
        boundary,
        "now",
      ).length,
      0,
    );
  assert.ok(places.length >= 10);
  assert.ok(
    places.every((p) => p.parking.geometry && p.sourceURL.includes("/way/")),
  );
});
test("recommendations respond to address, radius and category and prioritize documented history", () => {
  const first = rankLocations(places, settings, boundary, traffic);
  assert.ok(first[0].publishedHistory.length > 0);
  assert.ok(
    first.some(
      (p) =>
        p.id === "parking-way-227720878" &&
        p.publishedHistory.some((h) => h.scope === "lot"),
    ),
  );
  const far = rankLocations(
    places,
    {
      ...settings,
      origin: { lat: 34.05, lon: -118.24, label: "Los Angeles" },
      radius: 10,
    },
    boundary,
    traffic,
  );
  assert.equal(far.length, 0);
  const nearby = rankLocations(
    places,
    {
      ...settings,
      origin: { lat: 33.65, lon: -117.743, label: "Spectrum" },
      sortBy: "nearest",
    },
    boundary,
    traffic,
  );
  assert.notEqual(first[0].id, nearby[0].id);
  const campus = rankLocations(
    places,
    { ...settings, category: "campus" },
    boundary,
    traffic,
  );
  assert.ok(campus.length > 0);
  assert.ok(campus.every((p) => p.category === "campus"));
});
test("actual shifts rank exact lots; venue logs and other menus do not become lot sales", () => {
  const candidate = places.find(
    (p) => p.parking.venueId && !p.publishedHistory.length,
  );
  const logs = [
    { area: candidate.id, cuisine: "meals", orders: 100, hours: 2 },
    {
      area: candidate.parking.venueId,
      cuisine: "meals",
      orders: 9999,
      hours: 1,
    },
    { area: candidate.id, cuisine: "coffee", orders: 9000, hours: 1 },
  ];
  assert.equal(shiftEvidence(candidate, logs, "meals").ordersPerHour, 50);
  assert.equal(shiftEvidence(candidate, logs, "meals").venueShifts, 1);
  assert.equal(
    rankLocations(places, { ...settings, logs }, boundary, traffic)[0].id,
    candidate.id,
  );
});
test("approval and shortlist filters remain tied to exact parking lot IDs", () => {
  const candidate = places[0];
  assert.deepEqual(
    rankLocations(
      places,
      { ...settings, savedOnly: true, saved: [candidate.id] },
      boundary,
      traffic,
    ).map((p) => p.id),
    [candidate.id],
  );
  assert.equal(
    rankLocations(
      places,
      { ...settings, permissionOnly: true, approvals: {} },
      boundary,
      traffic,
    ).length,
    0,
  );
  assert.deepEqual(
    rankLocations(
      places,
      {
        ...settings,
        permissionOnly: true,
        approvals: { [candidate.id]: { status: "confirmed" } },
      },
      boundary,
      traffic,
    ).map((p) => p.id),
    [candidate.id],
  );
});

test("parking fees separate operator guidance from unverified map tags", async () => {
  const { parkingFeeInfo } = await import("./parking-core.js");
  const uci = parkingFeeInfo(
    { operator: "University of California, Irvine" },
    "UCI",
    "lot",
  );
  assert.equal(uci.status, "published");
  assert.match(uci.summary, /\$16\/day/);
  assert.match(uci.detail, /2026–2027/);
  const gp = parkingFeeInfo(
    { fee: "no" },
    "Great Park",
    "parking-way-227720878",
  );
  assert.equal(gp.status, "unconfirmed");
  assert.match(gp.summary, /unconfirmed/);
  assert.equal(
    parkingFeeInfo({ fee: "no" }, "Park", "lot").status,
    "unconfirmed",
  );
});

test("confirmed parking fees change surplus and preserve zero and decimals", () => {
  const b = {
    orders: 100,
    ticket: 10,
    food: 30,
    payment: 3,
    labor: 100,
    fee: 50,
    travel: 20,
    other: 10,
  };
  const base = calculateBudget(b);
  assert.equal(calculateBudget({ ...b, parkingFee: 0 }).surplus, base.surplus);
  assert.equal(
    calculateBudget({ ...b, parkingFee: 16.25 }).surplus,
    base.surplus - 16.25,
  );
});

test("order automation uses only matching real shifts and weights service hours", async () => {
  const { forecastShiftOrders } = await import("./location-core.js");
  const context = {
    area: "lot",
    cuisine: "meals",
    slot: "lunch",
    day: "weekday",
  };
  assert.equal(forecastShiftOrders([], context), null);
  const logs = [
    { ...context, orders: 100, hours: 2 },
    { ...context, orders: 20, hours: 1 },
    { ...context, area: "other", orders: 999, hours: 1 },
  ];
  assert.deepEqual(forecastShiftOrders(logs, context), {
    orders: 120,
    shifts: 2,
    hours: 3,
  });
  assert.equal(forecastShiftOrders(logs, { ...context, slot: "dinner" }), null);
});

test("current location requests fresh device coordinates and reports accuracy", async () => {
  let requestedOptions;
  const origin = await resolveCurrentLocation({
    geolocation: {
      getCurrentPosition(success, failure, options) {
        requestedOptions = options;
        success({
          coords: { latitude: 33.68, longitude: -117.82, accuracy: 12.4 },
        });
      },
    },
  });
  assert.deepEqual(requestedOptions, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  });
  assert.equal(origin.lat, 33.68);
  assert.equal(origin.lon, -117.82);
  assert.equal(origin.precision, "Device location (accuracy about 12 m)");
  assert.equal(origin.label, "My current location");
});

test("location permission, device failures and timeout give actionable errors", async () => {
  for (const [code, message] of [
    [1, /permission was denied/],
    [2, /location services/],
    [3, /took too long/],
  ]) {
    await assert.rejects(
      resolveCurrentLocation({
        geolocation: {
          getCurrentPosition(success, failure) {
            failure({ code });
          },
        },
      }),
      message,
    );
  }
  await assert.rejects(resolveCurrentLocation({ geolocation: null }), /HTTPS/);
});

test("invalid device coordinates do not invent a location", async () => {
  for (const coords of [
    { latitude: null, longitude: null },
    { latitude: 91, longitude: 0 },
    { latitude: NaN, longitude: 0 },
  ]) {
    await assert.rejects(
      resolveCurrentLocation({
        geolocation: {
          getCurrentPosition(success) {
            success({ coords });
          },
        },
      }),
      /invalid location/,
    );
  }
});

test("address suggestions merge nearby spelling and ZIP variants, preserving distinct addresses", () => {
  const feature = (street, postcode, housenumber = "3864") => ({
    geometry: { type: "Point", coordinates: [-117.77, 33.72] },
    properties: {
      countrycode: "US",
      street,
      postcode,
      housenumber,
      city: "Irvine",
      state: "California",
    },
  });
  const results = parseAddressResults({
    features: [
      feature("Viewpark Avenue", "92602"),
      feature("Viewpark Ave.", "92602-1234"),
      feature("Viewpark Ave", undefined),
      feature("Viewpark Ave", "92602", "3866"),
    ],
  });
  assert.equal(results.length, 2);
  assert.match(results[0].label, /3864/);
  assert.match(results[1].label, /3866/);
});

test("every mapped lot has a distinct consistent name across parks", () => {
  assert.equal(
    new Set(places.map((p) => p.name.toLowerCase())).size,
    places.length,
  );
  const reversed = parkingPlaces(
    { ...snapshot, elements: [...snapshot.elements].reverse() },
    catalog.places,
    boundary,
    snapshot.fetchedAt,
  );
  const names = new Map(reversed.map((p) => [p.id, p.name]));
  for (const place of places) assert.equal(names.get(place.id), place.name);
});

test("mobile location falls back from GPS failures to approximate location", async () => {
  for (const code of [2, 3]) {
    const requests = [];
    const origin = await resolveCurrentLocation({
      geolocation: {
        getCurrentPosition(success, failure, options) {
          requests.push(options);
          if (requests.length === 1) failure({ code });
          else
            success({
              coords: { latitude: 33.68, longitude: -117.82, accuracy: 850 },
            });
        },
      },
    });
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 60000,
    });
    assert.match(origin.precision, /850 m/);
  }
});
test("mobile location does not retry denied permissions", async () => {
  let calls = 0;
  await assert.rejects(
    resolveCurrentLocation({
      geolocation: {
        getCurrentPosition(success, failure) {
          calls++;
          failure({ code: 1 });
        },
      },
    }),
    /permission was denied/,
  );
  assert.equal(calls, 1);
});
