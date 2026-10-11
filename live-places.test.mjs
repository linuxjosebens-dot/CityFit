import { test } from "node:test";
import assert from "node:assert/strict";
import { livePlaces, providerStatus } from "./live-places.mjs";
const url = (provider) =>
  new URL(
    `http://localhost/api/location/places?provider=${provider}&lat=33.6859574&lon=-117.8261275&radius=15`,
  );
const response = (data) => ({ ok: true, json: async () => data });
test("live places reject invalid requests and missing credentials before contacting providers", async () => {
  let calls = 0;
  const fetcher = () => {
    calls++;
    throw new Error("unexpected");
  };
  assert.deepEqual(providerStatus({}), {
    google: false,
    apple: false,
    googleRoutes: false,
    appleRoutes: false,
  });
  assert.equal(
    (await livePlaces(url("google"), { env: {}, fetcher })).status,
    503,
  );
  for (const query of [
    "provider=other&lat=33&lon=-117&radius=15",
    "provider=google&lat=&lon=-117&radius=15",
    "provider=google&lat=91&lon=-117&radius=15",
    "provider=google&lat=33&lon=-117&radius=99",
  ])
    assert.equal(
      (
        await livePlaces(new URL("http://localhost/?" + query), {
          env: { GOOGLE_MAPS_API_KEY: "secret" },
          fetcher,
        })
      ).status,
      400,
    );
  assert.equal(calls, 0);
});
test("Google live search requests scoped fields, normalizes evidence and excludes locations outside Irvine", async () => {
  const requests = [];
  const result = await livePlaces(url("google"), {
    env: { GOOGLE_MAPS_API_KEY: "server-secret" },
    fetcher: async (u, o) => {
      requests.push([u, o]);
      return response({
        nextPageToken: "more",
        places: [
          {
            id: "irvine",
            displayName: { text: "Irvine parking" },
            location: { latitude: 33.6859574, longitude: -117.8261275 },
            formattedAddress: "Irvine CA",
            rating: 4.2,
            userRatingCount: 42,
            currentOpeningHours: { openNow: true },
            googleMapsUri: "https://www.google.com/maps/place/test",
            attributions: [
              {
                provider: "Example provider",
                providerUri: "https://example.com",
              },
            ],
          },
          {
            id: "other",
            displayName: { text: "Other city" },
            location: { latitude: 34.05, longitude: -118.24 },
          },
        ],
      });
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.places.length, 1);
  assert.equal(result.body.status, "partial");
  const p = result.body.places[0];
  assert.equal(p.reviewCount, 42);
  assert.equal(p.openNow, true);
  assert.equal(p.sourceId, "google");
  assert.equal(p.attributions[0].name, "Example provider");
  assert.equal(requests[0][1].headers["X-Goog-Api-Key"], "server-secret");
  assert.match(
    requests[0][1].headers["X-Goog-FieldMask"],
    /currentOpeningHours.openNow/,
  );
  assert.ok(JSON.parse(requests[0][1].body).locationRestriction.rectangle);
  assert.ok(!JSON.stringify(result.body).includes("server-secret"));
});
test("Apple exchanges the server token and returns places without fabricated ratings", async () => {
  const requests = [];
  const result = await livePlaces(url("apple"), {
    env: { APPLE_MAPS_AUTH_TOKEN: "signed-secret" },
    fetcher: async (u, o) => {
      requests.push([String(u), o]);
      return requests.length === 1
        ? response({ accessToken: "access-secret" })
        : response({
            results: [
              {
                id: "apple-id",
                name: "Apple parking",
                coordinate: { latitude: 33.6859574, longitude: -117.8261275 },
                formattedAddressLines: ["Irvine", "CA"],
              },
            ],
          });
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.places.length, 1);
  assert.equal(requests[0][1].headers.Authorization, "Bearer signed-secret");
  assert.equal(requests[1][1].headers.Authorization, "Bearer access-secret");
  assert.equal(
    new URL(requests[1][0]).searchParams.get("limitToCountries"),
    "US",
  );
  assert.equal(result.body.places[0].rating, null);
  assert.equal(result.body.places[0].openNow, null);
  assert.ok(!JSON.stringify(result.body).includes("secret"));
});
test("provider errors and timeouts return an actionable error without exposing credentials", async () => {
  for (const fetcher of [
    async () => ({ ok: false, status: 403 }),
    async () => {
      throw new Error("credential-secret");
    },
  ]) {
    const result = await livePlaces(url("google"), {
      env: { GOOGLE_MAPS_API_KEY: "credential-secret" },
      fetcher,
    });
    assert.equal(result.status, 502);
    assert.match(result.body.error, /billing or quota/);
    assert.ok(!JSON.stringify(result).includes("credential-secret"));
  }
});
