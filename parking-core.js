import { PARKING_HISTORY } from "./parking-history.js";
import { validPoint, distanceMiles, inIrvine } from "./location-core.js";

// Official published visitor rates are guidance, not a truck vending quote.
export function parkingFeeInfo(tags, nearbyName, lotId) {
  const checkedAt = "2026-10-10";
  if ((tags.operator || "").includes("University of California"))
    return {
      checkedAt,
      status: "published",
      scope: "Campus visitor permit guidance",
      summary: "$16/day general · $20/day reserved · $22/day service",
      detail:
        "UCI 2026–2027 published rates. Stall and permit restrictions apply. Truck/vendor eligibility and any service permit must be confirmed with UCI.",
      url: "https://parking.uci.edu/permits/rates/",
    };
  if (lotId === "parking-way-227720878" || /^Great Park/.test(nearbyName || ""))
    return {
      checkedAt,
      status: "unconfirmed",
      scope: "Great Park policy proposal",
      summary: "Current lot fee unconfirmed",
      detail:
        "June 23, 2026 staff proposal includes paid parking with lot, time and event rates. It does not establish the current operating fee. Confirm with the City and posted signs; older free-parking tags are not current fee verification.",
      url: "https://irvine.granicus.com/MetaViewer.php?event_id=2855&meta_id=187412&view_id=",
    };
  if (/Irvine Spectrum/.test(nearbyName || ""))
    return {
      checkedAt,
      status: "guidance",
      scope: "Shopping-center visitor guidance",
      summary:
        "Standard self-parking: complimentary; premium lot: $5 Mon–Thu / $20 Fri–Sun",
      detail:
        "Operator policy distinguishes standard and premium visitor parking. This mapped lot has not been matched to a rate zone. Truck/vendor parking requires a separate quote.",
      url: "https://www.irvinespectrumcenter.com/guest-services/parking-transportation",
    };
  return {
    checkedAt,
    status: "unconfirmed",
    scope: "Community map tag only",
    summary: "Current fee not verified",
    detail:
      tags.fee === "no"
        ? "OpenStreetMap marks this lot as free, but no current operator fee schedule was verified."
        : tags.fee === "yes"
          ? "OpenStreetMap marks this lot as paid; no current dollar rate was verified."
          : "No published lot-specific fee was verified.",
    url: null,
  };
}

// Lot centers identify mapped parking areas, not an approved vending bay.
export function parkingPlaces(data, venues, boundary, fetchedAt) {
  const places = (data.elements || []).flatMap((row) => {
    const t = row.tags || {},
      point = {
        lat: row.lat ?? row.center?.lat,
        lon: row.lon ?? row.center?.lon,
      };
    if (
      !validPoint(point) ||
      !inIrvine(point, boundary) ||
      t.amenity !== "parking" ||
      t.parking !== "surface" ||
      ["private", "no"].includes(t.access) ||
      ["private", "no"].includes(t.hgv) ||
      t.motor_vehicle === "no" ||
      t.motorcar === "no"
    )
      return [];
    const nearby = venues
      .map((v) => ({ v, d: distanceMiles(point, v) }))
      .filter((x) => Number.isFinite(x.d) && x.d <= 0.35)
      .sort((a, b) => a.d - b.d)[0];
    const ownAddress = [t["addr:housenumber"], t["addr:street"]]
      .filter(Boolean)
      .join(" ");
    const direction = nearby
      ? [
          "North",
          "Northeast",
          "East",
          "Southeast",
          "South",
          "Southwest",
          "West",
          "Northwest",
        ][
          (Math.round(
            Math.atan2(
              (point.lon - nearby.v.lon) *
                Math.cos((point.lat * Math.PI) / 180),
              point.lat - nearby.v.lat,
            ) /
              (Math.PI / 4),
          ) +
            8) %
            8
        ]
      : "";
    const lotName =
      row.id === 227720878
        ? "Great Park · Parking Lot 2"
        : t.name ||
          (t.ref && `Parking Lot ${t.ref}`) ||
          `Surface Parking ${row.id}`;
    const coordinates = row.geometry
      ?.map((p) => [p.lon, p.lat])
      .filter((p) => p.every(Number.isFinite));
    return [
      {
        id: `parking-${row.type}-${row.id}`,
        ...point,
        name:
          row.id === 227720878
            ? lotName
            : t.name || t.ref
              ? `${t.operator?.includes("University of California") ? "UCI" : nearby?.v.name || "Irvine"} · ${lotName}`
              : nearby
                ? `${nearby.v.name} · ${direction} Surface Lot`
                : "Irvine Surface Parking",
        category: t.operator?.includes("University of California")
          ? "campus"
          : nearby?.v.category || "community",
        address: ownAddress
          ? `${ownAddress}, Irvine, CA`
          : nearby
            ? `Near ${nearby.v.address || nearby.v.name}`
            : "Irvine, CA · Street address not listed",
        source: "OpenStreetMap parking record",
        sourceId: "osm-parking",
        sourceURL: `https://www.openstreetmap.org/${row.type}/${row.id}`,
        fetchedAt,
        reference: "Mapped surface parking lot center",
        publishedHistory: PARKING_HISTORY.filter(
          (h) =>
            h.lotId === `parking-${row.type}-${row.id}` ||
            (h.venueName && h.venueName === nearby?.v.name),
        ),
        parking: {
          access: t.access || "Not recorded",
          hgv: t.hgv || "Not recorded",
          capacity: t.capacity || "Not recorded",
          fee: t.fee || "Not recorded",
          feeInfo: parkingFeeInfo(
            t,
            nearby?.v.name,
            `parking-${row.type}-${row.id}`,
          ),
          operator: t.operator || "",
          modified: row.timestamp || null,
          venueId: nearby?.v.id || null,
          venueName: nearby?.v.name || null,
          geometry:
            coordinates?.length >= 3
              ? { type: "Polygon", coordinates: [coordinates] }
              : null,
        },
      },
    ];
  });
  const groups = new Map();
  for (const place of places) {
    const key = place.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place);
  }
  for (const lots of groups.values()) {
    if (lots.length < 2) continue;
    lots.sort(
      (a, b) => a.lat - b.lat || a.lon - b.lon || a.id.localeCompare(b.id),
    );
    lots.forEach((lot, index) => {
      lot.name += ` ${index + 1}`;
    });
  }
  return places;
}
