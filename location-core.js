export const MILES_TO_METERS = 1609.344;
export const CITY_CENTER = { lat: 33.6846, lon: -117.793 };
export const CATEGORY_NAMES = {
  all: "All Venue Types",
  retail: "Retail & Shopping",
  campus: "Campuses",
  workplace: "Offices & Workplaces",
  recreation: "Parks & Sports",
  community: "Community & Events",
};
export function validPoint(p) {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}
export function validOrigin(p) {
  return (
    validPoint(p) &&
    typeof p.label === "string" &&
    p.label.length > 0 &&
    p.label.length <= 500
  );
}
export function distanceMiles(a, b) {
  if (!validPoint(a) || !validPoint(b)) return null;
  const r = (n) => (n * Math.PI) / 180,
    h =
      Math.sin(r(b.lat - a.lat) / 2) ** 2 +
      Math.cos(r(a.lat)) *
        Math.cos(r(b.lat)) *
        Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
function ringContains(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point.lat !== b[1] > point.lat &&
      point.lon < ((b[0] - a[0]) * (point.lat - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function inIrvine(point, geometry) {
  if (!validPoint(point) || !geometry) return false;
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return polys.some(
    (rings) =>
      ringContains(point, rings[0]) &&
      !rings.slice(1).some((r) => ringContains(point, r)),
  );
}
export function pointToLineMiles(point, line) {
  if (!validPoint(point) || !Array.isArray(line) || !line.length) return null;
  const scale = Math.cos((point.lat * Math.PI) / 180);
  let best = Infinity;
  if (line.length === 1)
    return distanceMiles(point, { lon: line[0][0], lat: line[0][1] });
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    if (![...a, ...b].every(Number.isFinite)) continue;
    const ax = (a[0] - point.lon) * scale,
      ay = a[1] - point.lat,
      bx = (b[0] - point.lon) * scale,
      by = b[1] - point.lat,
      dx = bx - ax,
      dy = by - ay,
      t =
        dx * dx + dy * dy
          ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
          : 0;
    const d = distanceMiles(point, {
      lon: point.lon + (ax + t * dx) / scale,
      lat: point.lat + ay + t * dy,
    });
    best = Math.min(best, d);
  }
  return Number.isFinite(best) ? best : null;
}
export function nearestTraffic(place, traffic, maxDistance = 0.15) {
  let best = null;
  for (const row of traffic?.segments || []) {
    if (!Number.isFinite(row.count) || row.count <= 0) continue;
    const ds = (row.lines || [])
      .map((l) => pointToLineMiles(place, l))
      .filter(Number.isFinite);
    if (!ds.length) continue;
    const distance = Math.min(...ds);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance)
      best = {
        ...row,
        distance,
        year: traffic.year,
        source: traffic.source,
        fetchedAt: traffic.fetchedAt,
      };
  }
  return best;
}
export function dedupePlaces(places) {
  const result = [];
  for (const p of places) {
    if (
      !validPoint(p) ||
      typeof p.id !== "string" ||
      !p.name ||
      !Object.hasOwn(CATEGORY_NAMES, p.category) ||
      p.category === "all"
    )
      continue;
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const duplicate = result.find(
      (q) =>
        q.id === p.id ||
        (!p.parking &&
          !q.parking &&
          q.name.toLowerCase().replace(/[^a-z0-9]/g, "") === key &&
          distanceMiles(p, q) < 0.12),
    );
    if (duplicate) {
      duplicate.aliases = [...new Set([...(duplicate.aliases || []), p.id])];
      if (!duplicate.address && p.address) duplicate.address = p.address;
      if (!duplicate.website && p.website) duplicate.website = p.website;
    } else result.push({ ...p });
  }
  return result;
}
export function rankLocations(places, settings, boundary, traffic) {
  if (!validOrigin(settings.origin)) return [];
  const radius = Number(settings.radius);
  if (![10, 15, 20, 25, 30].includes(radius)) return [];
  const category = Object.hasOwn(CATEGORY_NAMES, settings.category)
    ? settings.category
    : "all";
  let result = dedupePlaces(places)
    .filter((p) => inIrvine(p, boundary))
    .map((p) => ({
      ...p,
      distance: distanceMiles(settings.origin, p),
      traffic: nearestTraffic(p, traffic),
      footTraffic: nearestFootTraffic(p),
      history: shiftEvidence(p, settings.logs || [], settings.cuisine),
    }))
    .filter(
      (p) =>
        p.distance <= radius + 1e-9 &&
        (category === "all" || p.category === category) &&
        (!settings.savedOnly || (settings.saved || []).includes(p.id)) &&
        (!settings.permissionOnly ||
          settings.approvals?.[p.id]?.status === "confirmed"),
    );
  const nearest = (a, b) =>
    a.distance - b.distance ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id);
  if (settings.sortBy === "history")
    result.sort(
      (a, b) =>
        (b.history.ordersPerHour ?? -1) - (a.history.ordersPerHour ?? -1) ||
        b.history.shifts - a.history.shifts ||
        (b.publishedHistory?.length || 0) - (a.publishedHistory?.length || 0) ||
        (b.traffic?.count ?? -1) - (a.traffic?.count ?? -1) ||
        nearest(a, b),
    );
  else if (settings.sortBy === "footTraffic")
    result.sort(
      (a, b) =>
        (b.footTraffic?.count ?? -1) - (a.footTraffic?.count ?? -1) ||
        nearest(a, b),
    );
  else if (settings.sortBy === "traffic")
    result.sort(
      (a, b) =>
        (b.traffic?.count ?? -1) - (a.traffic?.count ?? -1) || nearest(a, b),
    );
  else if (settings.sortBy === "reviews")
    result.sort(
      (a, b) => (b.reviewCount ?? -1) - (a.reviewCount ?? -1) || nearest(a, b),
    );
  else result.sort(nearest);
  return result.map((p, i) => ({ ...p, rank: i + 1 }));
}
export function parseAddressResults(data) {
  const seen = new Map();
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(
        /\b(street|avenue|boulevard|road|drive|lane|court|place|parkway|california)\b/g,
        (word) =>
          ({
            street: "st",
            avenue: "ave",
            boulevard: "blvd",
            road: "rd",
            drive: "dr",
            lane: "ln",
            court: "ct",
            place: "pl",
            parkway: "pkwy",
            california: "ca",
          })[word],
      )
      .replace(/\s+/g, " ")
      .trim();
  return (Array.isArray(data?.features) ? data.features : [])
    .flatMap((f) => {
      const p = f.properties || {},
        xy = f.geometry?.coordinates;
      if (
        f.geometry?.type !== "Point" ||
        !Array.isArray(xy) ||
        ["city", "county", "state", "country"].includes(p.type) ||
        p.countrycode?.toUpperCase() !== "US"
      )
        return [];
      const street = [p.housenumber, p.street].filter(Boolean).join(" "),
        first = street || p.name;
      if (!first) return [];
      const label = [first, p.city || p.town || p.village, p.state, p.postcode]
          .filter(Boolean)
          .join(", "),
        key = [first, p.city || p.town || p.village, p.state]
          .map(normalize)
          .join("|");
      const o = {
        label,
        lat: xy[1],
        lon: xy[0],
        precision:
          p.housenumber && p.street
            ? "Address match"
            : p.type === "street"
              ? "Street reference"
              : "Place Reference",
      };
      if (!validOrigin(o)) return [];
      const previous = seen.get(key) || [];
      if (previous.some((match) => distanceMiles(match, o) < 0.1)) return [];
      seen.set(key, [...previous, o]);
      return [o];
    })
    .slice(0, 6);
}
export function calculateBudget(b, orders = b.orders) {
  const revenue = orders * b.ticket,
    rate = (b.food + b.payment) / 100,
    variable = revenue * rate,
    fixed =
      (b.labor ?? 0) +
      (b.fee ?? 0) +
      (b.parkingFee ?? 0) +
      b.travel +
      (b.other ?? 0),
    unit = b.ticket * (1 - rate);
  return {
    orders,
    revenue,
    variable,
    fixed,
    surplus: revenue - variable - fixed,
    breakeven: unit > 0 ? Math.ceil(fixed / unit) : null,
    unit,
  };
}
export function googleLink(place, origin, route = false) {
  const u = new URL(
    route
      ? "https://www.google.com/maps/dir/"
      : "https://www.google.com/maps/search/",
  );
  u.searchParams.set("api", "1");
  u.searchParams.set(
    route ? "destination" : "query",
    place.lat + "," + place.lon,
  );
  if (place.googleId)
    u.searchParams.set(
      route ? "destination_place_id" : "query_place_id",
      place.googleId,
    );
  if (route) {
    u.searchParams.set("travelmode", "driving");
    if (validPoint(origin))
      u.searchParams.set("origin", origin.lat + "," + origin.lon);
  }
  return u.href;
}
export function shiftEvidence(place, logs, cuisine) {
  const exact = logs.filter(
    (l) => l.area === place.id && (!cuisine || l.cuisine === cuisine),
  );
  const nearby = logs.filter(
    (l) =>
      l.area === place.parking?.venueId && (!cuisine || l.cuisine === cuisine),
  );
  const hours = exact.reduce((s, l) => s + l.hours, 0),
    orders = exact.reduce((s, l) => s + l.orders, 0);
  return {
    shifts: exact.length,
    orders,
    hours,
    ordersPerHour: hours > 0 ? orders / hours : null,
    venueShifts: nearby.length,
  };
}

export function forecastShiftOrders(
  logs,
  { area, cuisine, slot, day },
  hours = 3,
) {
  const matches = logs.filter(
    (l) =>
      l.area === area &&
      l.cuisine === cuisine &&
      l.slot === slot &&
      l.day === day &&
      Number.isFinite(l.orders) &&
      l.orders >= 0 &&
      Number.isFinite(l.hours) &&
      l.hours > 0,
  );
  if (!matches.length) return null;
  const totalHours = matches.reduce((sum, l) => sum + l.hours, 0);
  const totalOrders = matches.reduce((sum, l) => sum + l.orders, 0);
  return {
    orders: Math.min(10000, Math.round((totalOrders / totalHours) * hours)),
    shifts: matches.length,
    hours: totalHours,
  };
}

// Caltrans 2025 pedestrian CSV: sum directions per observed hour, then average.
// These nearby survey counts do not measure lot visitors or live crowds.
export const PEDESTRIAN_SITES = [
  {
    id: "12015",
    lat: 33.679016,
    lon: -117.756957,
    start: "2025-01-01",
    end: "2025-05-28",
    observedHours: 181,
    count: 1.729281767955801,
  },
  {
    id: "12016",
    lat: 33.766884,
    lon: -117.867423,
    start: "2025-03-07",
    end: "2025-08-25",
    observedHours: 1917,
    count: 5.723526343244653,
  },
  {
    id: "12017",
    lat: 33.769355,
    lon: -117.867383,
    start: "2025-03-10",
    end: "2025-12-31",
    observedHours: 4805,
    count: 7.035379812695109,
  },
  {
    id: "12036",
    lat: 33.787837,
    lon: -117.878548,
    start: "2025-09-03",
    end: "2025-12-31",
    observedHours: 2362,
    count: 5.1735817104149024,
  },
];
export function nearestFootTraffic(place, maxDistance = 0.15) {
  let best = null;
  for (const site of PEDESTRIAN_SITES) {
    const distance = distanceMiles(place, site);
    if (distance === null || distance > maxDistance) continue;
    if (!best || distance < best.distance)
      best = {
        ...site,
        distance,
        year: 2025,
        unit: "pedestrians per observed hour",
        source: "Caltrans pedestrian hourly counts",
        sourceURL: "https://data.ca.gov/%40caltrans/at-count-dataset",
      };
  }
  return best;
}
