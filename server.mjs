import { estimateParking } from "./parking-price.mjs";
import { parkingPlaces, parkingFeeInfo } from "./parking-core.js";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL(".", import.meta.url));
const cache = new Map();
const publicFiles = new Set([
  "index.html",
  "intro.html",
  "intro.css",
  "intro.js",
  "auth-config.js",
  "firebase-client.js",
  "account.js",
  "theme.js",
  "theme.css",
  "privacy.html",
  "favicon.svg",
  "styles.css",
  "app.js",
  "shift-plan-pdf.js",
  "location-core.js",
  "business-data.js",
  "parking-core.js",
  "parking-history.js",
  "parking-snapshot.json",
  "catalog-snapshot.json",
  "traffic-snapshot.json",
  "irvine-boundary.json",
  "vendor/leaflet.js",
  "vendor/leaflet.css",
  "vendor/images/marker-icon.png",
  "vendor/images/marker-icon-2x.png",
  "vendor/images/marker-shadow.png",
  "vendor/images/layers.png",
  "vendor/images/layers-2x.png",
]);
export function normalizeStations(data, fuelType) {
  return (Array.isArray(data?.stations) ? data.stations : []).flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const price = (Array.isArray(s.prices) ? s.prices : []).find(
      (p) =>
        p &&
        String(p.fuelType) === fuelType &&
        p.currency === "USD" &&
        p.available !== false &&
        Number.isFinite(p.price) &&
        p.price > 0 &&
        p.errorMargin === undefined &&
        Number.isFinite(Date.parse(p.modified)) &&
        Date.now() - Date.parse(p.modified) < 48 * 3600000 &&
        Date.parse(p.modified) <= Date.now(),
    );
    if (
      !price ||
      !Number.isFinite(s.position?.lat) ||
      !Number.isFinite(s.position?.lng) ||
      s.stationDetails?.restrictedAccess
    )
      return [];
    const unit = String(price.unit).toLowerCase();
    const factor = ["gal", "gallon", "usgal", "us gallon"].includes(unit)
      ? 1
      : unit === "l"
        ? 3.785411784
        : null;
    if (!factor) return [];
    return [
      {
        id: s.id,
        name: s.name || s.brand || "Fuel station",
        lat: s.position.lat,
        lon: s.position.lng,
        address: s.address?.label || "",
        price: price.price * factor,
        modified: price.modified,
        source: "HERE Fuel Prices",
      },
    ];
  });
}
export async function fuelPrices(url) {
  if (!process.env.HERE_API_KEY)
    return {
      status: 503,
      body: {
        error:
          "Set HERE_API_KEY on the server to enable automatic station prices.",
      },
    };
  const parts = (url.searchParams.get("bbox") || "").split(",");
  const bbox = parts.map(Number),
    fuelType = url.searchParams.get("fuelType") || "2";
  if (
    parts.some((p) => !p.trim()) ||
    bbox.length !== 4 ||
    !bbox.every(Number.isFinite) ||
    bbox[0] < -180 ||
    bbox[2] > 180 ||
    bbox[1] < -90 ||
    bbox[3] > 90 ||
    bbox[2] <= bbox[0] ||
    bbox[3] <= bbox[1] ||
    bbox[2] - bbox[0] > 0.8 ||
    bbox[3] - bbox[1] > 0.8 ||
    !["1", "2", "3", "4"].includes(fuelType)
  )
    return {
      status: 400,
      body: { error: "Invalid local bounds or fuel type." },
    };
  const key = bbox.join(",") + ":" + fuelType,
    cached = cache.get(key);
  if (cached && Date.now() - cached.time < 300000)
    return { status: 200, body: cached.body };
  const stations = [];
  let truncated = false,
    offset = 0;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      in: "bbox:" + bbox.join(","),
      fuelTypes: fuelType,
      limit: "100",
      offset: String(offset),
      apiKey: process.env.HERE_API_KEY,
    });
    const r = await fetch("https://fuel.hereapi.com/v3/stations?" + q, {
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok)
      return {
        status: 502,
        body: {
          error:
            "HERE Fuel Prices unavailable. Check account access and credential.",
        },
      };
    const data = await r.json();
    if (!Array.isArray(data.stations))
      return {
        status: 502,
        body: { error: "Fuel price response unavailable." },
      };
    stations.push(...normalizeStations(data, fuelType));
    if (!data.hasMore) break;
    const next = Number(data.nextOffset);
    offset =
      Number.isInteger(next) && next > offset
        ? next
        : offset + data.stations.length;
    if (!data.stations.length) {
      truncated = true;
      break;
    }
    if (page === 4) truncated = true;
  }
  const body = {
    stations,
    truncated,
    source: "HERE Fuel Prices",
    fetchedAt: new Date().toISOString(),
  };
  if (cache.size > 100) cache.clear();
  cache.set(key, { time: Date.now(), body });
  return { status: 200, body };
}
export const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-cache");
  const json = (status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
  };
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      json(405, { error: "Method not allowed." });
      return;
    }
    const url = new URL(req.url, "http://localhost");
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}` &&
      req.headers.origin !== `https://${req.headers.host}`
    ) {
      json(403, { error: "Cross-origin request not allowed." });
      return;
    }
    if (url.pathname === "/api/parking-fee") {
      const id = url.searchParams.get("location"),
        slot = url.searchParams.get("slot");
      if (
        !/^parking-way-\d+$/.test(id || "") ||
        !["breakfast", "lunch", "dinner"].includes(slot)
      ) {
        json(400, {
          error: "Choose a mapped parking lot and valid service window.",
        });
        return;
      }
      const key = `parking-fee:${id}:${slot}`,
        hit = cache.get(key);
      if (hit && Date.now() - hit.time < 300000) {
        json(200, hit.body);
        return;
      }
      const [snapshot, catalog, boundary] = await Promise.all(
        [
          "parking-snapshot.json",
          "catalog-snapshot.json",
          "irvine-boundary.json",
        ].map(async (file) =>
          JSON.parse(await readFile(path.join(root, file), "utf8")),
        ),
      );
      const place = parkingPlaces(
        snapshot,
        catalog.places,
        boundary,
        snapshot.fetchedAt,
      ).find((p) => p.id === id);
      if (!place) {
        json(404, { error: "Parking lot is not eligible or is unavailable." });
        return;
      }
      const row = snapshot.elements.find(
        (r) => `parking-${r.type}-${r.id}` === id,
      );
      let tags = row.tags,
        source = "Saved OpenStreetMap record",
        fetchedAt = snapshot.fetchedAt;
      try {
        const response = await fetch(
          `https://api.openstreetmap.org/api/0.6/way/${row.id}.json`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!response.ok) throw new Error("OSM unavailable");
        const data = await response.json(),
          live = data.elements?.find(
            (r) => r.type === "way" && r.id === row.id,
          );
        if (!live?.tags) throw new Error("Missing lot");
        tags = live.tags;
        source = "Live OpenStreetMap record";
        fetchedAt = new Date().toISOString();
      } catch {}
      const info = parkingFeeInfo(tags, place.parking.venueName, id);
      const quote = estimateParking(tags, info, 3);
      const body = {
        ...quote,
        location: id,
        slot,
        hours: 3,
        source:
          info?.status === "published" ? "Published UCI rate guidance" : source,
        sourceURL: quote.sourceURL || place.sourceURL,
        fetchedAt,
        status: quote.amount === null ? "unavailable" : "estimate",
      };
      if (cache.size > 100) cache.clear();
      cache.set(key, { time: Date.now(), body });
      json(200, body);
      return;
    }
    if (url.pathname === "/api/location/parking") {
      const body = await readFile(path.join(root, "parking-snapshot.json"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }
    if (url.pathname === "/api/location/status") {
      json(200, {
        city: true,
        osm: true,
        google: false,
        apple: false,
        googleRoutes: false,
        appleRoutes: false,
        fuelPrices: !!process.env.HERE_API_KEY,
      });
      return;
    }
    if (url.pathname === "/api/fuel-prices") {
      if (req.method === "HEAD") {
        json(200, {});
        return;
      }
      const result = await fuelPrices(url);
      json(result.status, result.body);
      return;
    }
    const name = decodeURIComponent(
      url.pathname === "/" ? "/intro.html" : url.pathname,
    ).slice(1);
    if (!publicFiles.has(name)) {
      json(404, { error: "Not found." });
      return;
    }
    const file = path.join(root, name),
      body = await readFile(file),
      mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    json(error.code === "ENOENT" ? 404 : 502, {
      error:
        error.code === "ENOENT"
          ? "Not found."
          : "Requested service unavailable.",
    });
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Port is in use. Set PORT to an available port and try again."
        : "Unable to start the local server.",
    );
    process.exitCode = 1;
  });
  server.listen(Number(process.env.PORT) || 8080, "127.0.0.1", () =>
    console.log("CityFit: http://localhost:" + (process.env.PORT || 8080)),
  );
}
