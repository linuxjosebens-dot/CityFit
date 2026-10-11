import { validPoint, distanceMiles, inIrvine } from "./location-core.js";
import { readFile } from "node:fs/promises";
const boundary = JSON.parse(
  await readFile(new URL("./irvine-boundary.json", import.meta.url), "utf8"),
);
export function providerStatus(env = process.env) {
  return {
    google: Boolean(env.GOOGLE_MAPS_API_KEY),
    apple: Boolean(env.APPLE_MAPS_AUTH_TOKEN),
    googleRoutes: false,
    appleRoutes: false,
  };
}
async function getJSON(fetcher, url, options = {}) {
  const response = await fetcher(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Provider request failed");
  return response.json();
}
function sourceURL(value, fallback, hosts) {
  try {
    const u = new URL(value);
    if (u.protocol === "https:" && (!hosts || hosts.includes(u.hostname)))
      return u.href;
  } catch {}
  return fallback;
}
export async function livePlaces(
  url,
  { env = process.env, fetcher = fetch } = {},
) {
  const provider = url.searchParams.get("provider");
  const latText = url.searchParams.get("lat"),
    lonText = url.searchParams.get("lon");
  const origin = { lat: Number(latText), lon: Number(lonText) };
  const radius = Number(url.searchParams.get("radius"));
  if (
    !["google", "apple"].includes(provider) ||
    !latText ||
    !lonText ||
    !validPoint(origin) ||
    ![10, 15, 20, 25, 30].includes(radius)
  )
    return {
      status: 400,
      body: {
        error:
          "Choose Google or Apple, valid coordinates, and a supported radius.",
      },
    };
  if (!providerStatus(env)[provider])
    return {
      status: 503,
      body: {
        error: `${provider === "google" ? "Google Places" : "Apple Maps"} credentials have not been configured on the API server.`,
      },
    };
  const fetchedAt = new Date().toISOString();
  try {
    let rows,
      partial = false;
    if (provider === "google") {
      const data = await getJSON(
        fetcher,
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.googleMapsUri,places.attributions,nextPageToken",
          },
          body: JSON.stringify({
            textQuery: "parking lots in Irvine California",
            pageSize: 20,
            languageCode: "en",
            locationRestriction: {
              rectangle: {
                low: { latitude: 33.6, longitude: -117.9 },
                high: { latitude: 33.81, longitude: -117.68 },
              },
            },
          }),
        },
      );
      if (data.places !== undefined && !Array.isArray(data.places))
        throw new Error("Invalid places");
      partial = Boolean(data.nextPageToken);
      rows = (data.places || []).map((p) => ({
        id: `google-${p.id}`,
        name: p.displayName?.text,
        lat: p.location?.latitude,
        lon: p.location?.longitude,
        address: p.formattedAddress || "",
        category: "community",
        source: "Google Maps",
        sourceId: "google",
        sourceURL: sourceURL(
          p.googleMapsUri,
          `https://www.google.com/maps/search/?api=1&query=parking&query_place_id=${encodeURIComponent(p.id)}`,
          ["www.google.com", "maps.google.com"],
        ),
        googleId: p.id,
        rating: Number.isFinite(p.rating) ? p.rating : null,
        reviewCount: Number.isFinite(p.userRatingCount)
          ? p.userRatingCount
          : null,
        openNow:
          typeof p.currentOpeningHours?.openNow === "boolean"
            ? p.currentOpeningHours.openNow
            : null,
        attributions: (p.attributions || []).map((a) => ({
          name: a.provider || "",
          uri: sourceURL(a.providerUri, null),
        })),
        fetchedAt,
      }));
    } else {
      const token = await getJSON(
        fetcher,
        "https://maps-api.apple.com/v1/token",
        { headers: { Authorization: `Bearer ${env.APPLE_MAPS_AUTH_TOKEN}` } },
      );
      if (!token.accessToken) throw new Error("Apple token unavailable");
      const search = new URL("https://maps-api.apple.com/v1/search");
      search.search = new URLSearchParams({
        q: "parking lots in Irvine California",
        searchLocation: `${origin.lat},${origin.lon}`,
        searchRegion: "33.81,-117.68,33.60,-117.90",
        limitToCountries: "US",
        lang: "en-US",
      }).toString();
      const data = await getJSON(fetcher, search, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (!Array.isArray(data.results)) throw new Error("Invalid places");
      partial = Boolean(data.paginationInfo?.nextPageToken);
      rows = data.results.map((p) => ({
        id: `apple-${p.id || `${p.coordinate?.latitude},${p.coordinate?.longitude}`}`,
        name: p.name,
        lat: p.coordinate?.latitude,
        lon: p.coordinate?.longitude,
        address: (p.formattedAddressLines || []).join(", "),
        category: "community",
        source: "Apple Maps",
        sourceId: "apple",
        sourceURL: `https://maps.apple.com/?ll=${p.coordinate?.latitude},${p.coordinate?.longitude}&q=${encodeURIComponent(p.name || "Parking")}`,
        rating: null,
        reviewCount: null,
        openNow: null,
        attributions: [],
        fetchedAt,
      }));
    }
    const places = rows.filter(
      (p) =>
        p.name &&
        (provider !== "google" ||
          (typeof p.googleId === "string" && p.googleId)) &&
        validPoint(p) &&
        inIrvine(p, boundary) &&
        distanceMiles(origin, p) <= radius,
    );
    return {
      status: 200,
      body: {
        places,
        status: partial ? "partial" : "fresh",
        partial,
        fetchedAt,
        source: provider === "google" ? "Google Maps" : "Apple Maps",
      },
    };
  } catch {
    return {
      status: 502,
      body: {
        error:
          "Live place search failed. Check the provider credential, API access, billing or quota, then retry.",
      },
    };
  }
}
