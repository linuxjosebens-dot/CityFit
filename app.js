import { createShiftPlanPDF } from "./shift-plan-pdf.js";
import { parkingPlaces } from "./parking-core.js";
import {
  CATEGORY_NAMES,
  forecastShiftOrders,
  CITY_CENTER,
  validPoint,
  validOrigin,
  distanceMiles,
  rankLocations,
  parseAddressResults,
  calculateBudget,
  googleLink,
  appleLink,
  dedupePlaces,
} from "./location-core.js";
import { PERMITS, LEGACY_AREAS } from "./business-data.js";
import { initializeAccount } from "./account.js";

const STORAGE = "city-fit-irvine-v1";
const DEFAULT = {
  parkingVersion: 1,
  origin: null,
  radius: 15,
  sortBy: "history",
  category: "all",
  provider: "public",
  fuelType: "2",
  cuisine: "meals",
  slot: "lunch",
  day: "weekday",
  serviceStartDate: "",
  serviceEndDate: "",
  serviceStartTime: "11:00",
  serviceEndTime: "14:00",
  serviceSelectedDates: [],
  saved: [],
  approvals: {},
  checks: {},
  logs: [],
  budget: {
    area: "",
    orders: 80,
    ticket: 14,
    food: 35,
    payment: 3,
    travel: 0,
    mpg: 10,
    fuelPrice: 5,
  },
};
const names = {
  meals: "Meals, tacos & bowls",
  coffee: "Coffee & breakfast",
  dessert: "Desserts & snacks",
};
const safe = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
const dateText = (v) => {
  if (!v) return "Date not reported";
  const d = new Date(v);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Los_Angeles",
      }).format(d)
    : "Date not reported";
};
const count = (n) => n.toLocaleString("en-US");
const serviceNames = {
  weekday: "Weekday",
  weekend: "Weekend",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};
const accessText = (v) =>
  ({
    yes: "Allowed",
    designated: "Designated",
    customers: "Customers only",
    permit: "Permit required",
    no: "Not allowed",
    private: "Private",
    unknown: "Unknown",
  })[v] ||
  v ||
  "Not recorded";
const roadName = (v) =>
  String(v || "")
    .split(" ")
    .map((w) =>
      w === w.toUpperCase()
        ? w[0]?.toUpperCase() + w.slice(1).toLowerCase()
        : w,
    )
    .join(" ");
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const toISODate = (date) => {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (isoDate, count) => {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + count);
  return toISODate(date);
};

const datesBetween = (startIso, endIso) => {
  const start = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  const list = [];
  const cursor = new Date(start);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return list;
  const min = start < end ? start : end;
  const max = start < end ? end : start;
  for (
    const value = new Date(min);
    value <= max;
    value.setDate(value.getDate() + 1)
  ) {
    list.push(toISODate(value));
  }
  return list;
};

export function loadState() {
  try {
    const r = JSON.parse(
      localStorage.getItem(STORAGE) ||
        localStorage.getItem("truckfit-irvine-v1") ||
        "null",
    );
    if (!r || typeof r !== "object" || Array.isArray(r))
      return structuredClone(DEFAULT);
    const s = {
      ...structuredClone(DEFAULT),
      ...r,
      budget: { ...DEFAULT.budget, ...r.budget },
    };
    s.fuelType = ["1", "2", "3", "4"].includes(s.fuelType) ? s.fuelType : "2";
    s.origin =
      validOrigin(s.origin) &&
      s.origin.precision !== "Approximate network location"
        ? s.origin
        : null;
    s.radius = [10, 15, 20, 25, 30].includes(Number(s.radius))
      ? Number(s.radius)
      : 15;
    s.sortBy = ["history", "nearest", "traffic", "reviews"].includes(s.sortBy)
      ? s.sortBy
      : "history";
    s.category = Object.hasOwn(CATEGORY_NAMES, s.category) ? s.category : "all";
    s.provider = ["public", "google", "apple"].includes(s.provider)
      ? s.provider
      : "public";
    s.saved = Array.isArray(s.saved)
      ? [...new Set(s.saved.filter((x) => typeof x === "string"))]
      : [];
    s.logs = Array.isArray(s.logs)
      ? s.logs.filter(
          (l) =>
            l &&
            typeof l === "object" &&
            typeof l.id === "string" &&
            typeof l.area === "string" &&
            Number.isFinite(l.orders) &&
            l.orders >= 0 &&
            Number.isFinite(l.hours) &&
            l.hours > 0,
        )
      : [];
    s.approvals =
      s.approvals &&
      typeof s.approvals === "object" &&
      !Array.isArray(s.approvals)
        ? Object.fromEntries(
            Object.entries(s.approvals)
              .filter(([id, a]) => id && a && typeof a === "object")
              .map(([id, a]) => [
                id,
                {
                  status: ["unknown", "contacted", "confirmed"].includes(
                    a.status,
                  )
                    ? a.status
                    : "unknown",
                  note: typeof a.note === "string" ? a.note.slice(0, 2000) : "",
                },
              ]),
          )
        : {};
    s.checks = s.checks && typeof s.checks === "object" ? s.checks : {};
    s.cuisine = Object.hasOwn(names, s.cuisine) ? s.cuisine : "meals";
    s.slot = ["breakfast", "lunch", "dinner"].includes(s.slot)
      ? s.slot
      : "lunch";
    s.day = ["weekday", "weekend"].includes(s.day) ? s.day : "weekday";
    s.serviceStartDate =
      typeof s.serviceStartDate === "string" ? s.serviceStartDate : "";
    s.serviceEndDate =
      typeof s.serviceEndDate === "string" ? s.serviceEndDate : "";
    s.serviceStartTime =
      typeof s.serviceStartTime === "string" ? s.serviceStartTime : "11:00";
    s.serviceEndTime =
      typeof s.serviceEndTime === "string" ? s.serviceEndTime : "14:00";
    s.serviceSelectedDates = Array.isArray(s.serviceSelectedDates)
      ? s.serviceSelectedDates.filter((v) => typeof v === "string")
      : [];
    for (const k of Object.keys(DEFAULT.budget).filter((k) => k !== "area")) {
      const n = Number(s.budget[k]);
      s.budget[k] = Number.isFinite(n) && n >= 0 ? n : DEFAULT.budget[k];
    }
    const limits = {
      orders: [0, 10000],
      ticket: [0.01, 1000],
      food: [0, 99],
      payment: [0, 50],
      mpg: [1, 100],
      fuelPrice: [0, 100],
    };
    for (const [key, [min, max]] of Object.entries(limits))
      s.budget[key] = Math.min(max, Math.max(min, s.budget[key]));
    s.budget.orders = Math.round(s.budget.orders);
    for (const key of ["ticket"])
      s.budget[key] = Math.round(s.budget[key] * 100) / 100;
    for (const key of ["food", "payment", "mpg"])
      s.budget[key] = Math.round(s.budget[key] * 10) / 10;
    s.budget.fuelPrice = Math.max(0, s.budget.fuelPrice);
    if (!r.parkingVersion) s.sortBy = "history";
    s.parkingVersion = 1;
    if (typeof s.budget.area !== "string") s.budget.area = "";
    delete s.budget.labor;
    delete s.budget.travelRate;
    delete s.budget.other;
    delete s.budget.fee;
    delete s.budget.parkingFee;
    return s;
  } catch {
    return structuredClone(DEFAULT);
  }
}
async function fetchJSON(url, signal) {
  const r = await fetch(url, {
    signal: signal || AbortSignal.timeout(32000),
    credentials: "same-origin",
  });
  if (!r.ok) throw new Error("Request unavailable");
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d;
}

export async function resolveCurrentLocation({
  geolocation = globalThis.navigator?.geolocation,
} = {}) {
  if (!geolocation?.getCurrentPosition)
    throw new Error(
      "Location services are unavailable in this browser. Open the HTTPS website or enter your starting address.",
    );
  const position = await new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      resolve,
      (error) => {
        const messages = {
          1: "Location permission was denied. Allow location for this website in your browser settings, then retry, or enter your starting address.",
          2: "Your device could not determine its location. Check that location services are enabled, then retry or enter your starting address.",
          3: "Finding your location took too long. Retry or enter your starting address.",
        };
        reject(
          new Error(
            messages[error?.code] ||
              "Current location is unavailable. Enter your starting address instead.",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
  const accuracy = position?.coords?.accuracy;
  const origin = {
    lat: position?.coords?.latitude,
    lon: position?.coords?.longitude,
    label: "My current location",
    precision:
      Number.isFinite(accuracy) && accuracy >= 0
        ? `Device location (accuracy about ${Math.max(1, Math.round(accuracy))} m)`
        : "Device location",
  };
  if (!validOrigin(origin))
    throw new Error(
      "Your device returned an invalid location. Retry or enter your starting address.",
    );
  return origin;
}

export async function initApp() {
  const $ = (id) => document.getElementById(id);
  const staticHosting = location.hostname.endsWith(".github.io");
  let state = loadState(),
    catalog = { places: [], status: "loading" },
    traffic = { segments: [], status: "loading" },
    boundary = null,
    providerPlaces = null,
    providers = { city: true, osm: true, google: false, apple: false },
    visible = [],
    selected = null,
    map = null,
    pinLayer = null,
    originLayer = null,
    boundaryLayer = null,
    parkingLayer = null,
    roadLayer = null,
    parking = { elements: [], status: "loading" },
    pins = new Map(),
    toastTimer,
    providerVersion = 0,
    providerController = null,
    radiusTimer,
    geolocationVersion = 0,
    routeVersion = 0,
    detailReturnId = null,
    storageWarningShown = false;
  initializeAccount();
  const allPlaces = () =>
    state.provider === "public"
      ? parkingPlaces(parking, catalog.places, boundary, parking.fetchedAt)
      : providerPlaces?.places || [];
  const findPlace = (id) =>
    [
      ...parkingPlaces(parking, catalog.places, boundary, parking.fetchedAt),
      ...allPlaces(),
      ...catalog.places,
    ].find((p) => p.id === id || (p.aliases || []).includes(id)) ||
    LEGACY_AREAS.find((p) => p.id === id);
  const approvalText = (id) =>
    ({
      unknown: "Host approval not researched",
      contacted: "Host contacted",
      confirmed: "Approval recorded by you",
    })[state.approvals[id]?.status || "unknown"];
  function toast(text) {
    $("toast").textContent = text;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
  }
  function updateProfileStats() {
    $("profileSavedCount").textContent = state.saved.length;
    $("profileShiftCount").textContent = state.logs.length;
  }
  function updateServiceRange(startIso, endIso) {
    const nextStart = startIso || "";
    const nextEnd = endIso || "";
    state.serviceStartDate = nextStart;
    state.serviceEndDate = nextEnd;
    state.serviceSelectedDates =
      nextStart && nextEnd
        ? datesBetween(nextStart, nextEnd)
        : nextStart
          ? [nextStart]
          : [];
    save();
    const startInput = $("serviceStartDate");
    const endInput = $("serviceEndDate");
    if (startInput) startInput.value = nextStart;
    if (endInput) endInput.value = nextEnd;
  }
  function save() {
    updateProfileStats();
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      if (storageWarningShown) return;
      storageWarningShown = true;
      toast("Export your plan to keep it. Browser storage is unavailable.");
    }
  }
  const viewIds = new Set(["locations", "planner", "permits", "data"]);
  function view(id) {
    if (!viewIds.has(id)) return;
    history.replaceState(null, "", `#${id}`);
    document.querySelectorAll(".view").forEach((x) => (x.hidden = x.id !== id));
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === id);
      if (b.dataset.view === id) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("crumb").textContent = {
      locations: "Location Research",
      planner: "Shift Planner",
      permits: "Permit Checklist",
      data: "Data & Sources",
    }[id];
    const heading = $(id)?.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    if (id === "locations" && map) setTimeout(() => map.invalidateSize(), 0);
  }
  function statusDate(data, label) {
    if (data?.status === "loading") return label + " · Loading";
    if (data?.status === "unavailable") return label + " · Unavailable";
    const kind =
      data?.status === "snapshot"
        ? "Snapshot"
        : data?.status === "partial"
          ? "Partial Refresh"
          : "Retrieved";
    return `${label} ${kind} · ${dateText(data?.fetchedAt)}`;
  }
  function updateSourceStatus() {
    $("catalogStamp").textContent = statusDate(
      state.provider === "public" ? parking : providerPlaces,
      state.provider === "public"
        ? "Mapped Parking · Partial Irvine Coverage"
        : state.provider === "google"
          ? "Google Maps Places"
          : "Apple Maps Places",
    );
    $("trafficStamp").textContent = traffic.year
      ? `City Vehicle Counts · ${traffic.year} Measurement Year · ${traffic.status === "snapshot" ? "Saved Snapshot" : "Retrieved Records"}`
      : "City Traffic · Loading";
    $("providerConnections").innerHTML = [
      [
        "Mapped surface parking",
        true,
        "Saved lots · Partial Irvine coverage. " +
          statusDate(parking, "Parking records"),
      ],
      [
        "Google Maps",
        providers.google,
        "Place reviews, opening status and traffic-aware driving time.",
      ],
      [
        "Apple Maps",
        providers.apple,
        "Place search and driving-route duration.",
      ],
    ]
      .map(
        ([name, connected, desc]) =>
          `<article class="connection-card"><h3>${name}</h3><span class="badge ${connected ? "" : "amber"}">${connected ? "Available" : "Account Not Connected"}</span><p>${safe(desc)}</p></article>`,
      )
      .join("");
  }
  function render() {
    visible = rankLocations(
      allPlaces(),
      {
        ...state,
        savedOnly: $("savedOnly").checked,
        permissionOnly: $("permissionOnly").checked,
      },
      boundary,
      traffic,
    ).slice(0, 10);
    const unfiltered = rankLocations(
      allPlaces(),
      { ...state, savedOnly: false, permissionOnly: false },
      boundary,
      traffic,
    );
    if (visible.some((p) => p.id === state.budget.area))
      selected = state.budget.area;
    else selected = visible[0]?.id || null;
    $("radiusValue").textContent = state.radius + " mi";
    $("clearOrigin").hidden = !state.origin;
    $("nearSummary").hidden = !state.origin;
    $("nearSummary").innerHTML = state.origin
      ? `<div><strong>Starting From ${safe(state.origin.label)}</strong><span>${state.radius} Mile Radius · Irvine Locations Only · ${safe(String(state.origin.precision || "Confirmed Location").replace(/\b[a-z]/g, (c) => c.toUpperCase()))}${state.origin.accuracy ? " · Location accuracy ≈ " + Math.round(state.origin.accuracy) + " m" : ""}</span></div><span>${unfiltered.length} Locations Within Reach</span>`
      : "";
    $("venueCount").textContent = state.origin ? unfiltered.length : "—";
    $("closestDistance").textContent = unfiltered.length
      ? Math.min(...unfiltered.map((p) => p.distance)).toFixed(1)
      : "—";
    $("savedCount").textContent = state.saved.length;
    const checks = PERMITS.filter((p) => state.checks[p[0]]).length;
    $("permitCount").textContent = checks + " / 6";
    $("checkProgress").textContent = checks + " of 6 Recorded";
    $("progressFill").style.width = (checks / 6) * 100 + "%";
    $("resultsTitle").textContent = state.origin
      ? state.provider === "public"
        ? "Parking Sites Near Your Start"
        : "Venues Near Your Start"
      : "Set Your Starting Point";
    $("resultDescription").textContent = state.origin
      ? `${visible.length} Shown from ${unfiltered.length} Irvine ${state.provider === "public" ? "Mapped Parking Sites (Partial Coverage)" : "Venues"} Within ${state.radius} Miles.`
      : "Enter an address or use Current Location to see your top 10.";
    $("rankingCaption").textContent =
      state.sortBy === "history"
        ? "Past evidence first: your orders per service hour for this menu at this lot, then published event history, historical Road Counts, and distance. Venue event history does not identify a vendor bay."
        : state.sortBy === "traffic"
          ? `Highest ${traffic.year || "published"} vehicle counts on a measured road within 0.15 mi of each venue. Missing counts sort after known counts.`
          : state.sortBy === "reviews"
            ? "Cumulative Google review counts, highest first. Reviews are engagement, not current customer traffic."
            : "Closest first, using mapped lot-center coordinates for parking sites. Menu and service window are saved with your plan.";
    $("cards").innerHTML = visible.length
      ? visible.map(cardHTML).join("")
      : emptyHTML();
    renderPlannerChoices();
    renderBudget();
    renderCatalogChoices();
    renderLotPermits();
    updateSourceStatus();
    renderMap();
  }
  function renderLotPermits() {
    const selectedLot = visible.find((lot) => lot.id === state.budget.area);
    const matches = selectedLot ? [selectedLot] : [];
    $("permitLocationName").textContent = selectedLot
      ? selectedLot.name
      : "Choose a service location";
    $("permitLocationAddress").textContent = selectedLot
      ? selectedLot.address
      : "Select a lot in Shift Planner to see its permit guidance.";
    $("lotPermits").innerHTML = matches.length
      ? matches
          .map((lot) => {
            const campus = lot.category === "campus";
            const park = lot.category === "recreation";
            const site = campus
              ? [
                  "Ask UCI for permission",
                  "Talk to the campus event organizer and UCI Dining. Ask UCI’s safety team if you need a temporary food permit.",
                  "https://www.ehs.uci.edu/enviro-health/food-safety/food-safety-permit-process.php",
                ]
              : park
                ? [
                    "Ask the City or event organizer",
                    "For a City park event, ask the organizer about reserving the space. Ask Irvine if your event needs a special-event permit or food-vendor documents.",
                    "https://specialevents.cityofirvine.org/dashboard/application/start/4fc6af6c-a1b9-4f62-97d0-ac0277e9efae",
                  ]
                : [
                    "Ask the owner for permission",
                    "Ask the owner if you can sell food in this lot at your planned time. Ask the owner and City if you need any other approval.",
                    "https://specialevents.cityofirvine.org/",
                  ];
            return `<details open class="panel lot-permit-card"><summary>${safe(lot.name)}</summary><p class="help">${safe(lot.address)}</p><ul><li><strong>Finish the six steps above</strong><p>Start with your health permit, business license and seller’s permit checks.</p></li><li><strong>${site[0]}</strong><p>${site[1]} <a href="${site[2]}" target="_blank" rel="noopener">Learn how ↗</a></p></li><li><strong>Check before you arrive</strong><p>Ask the host: Can my truck fit? When can I serve? Where is the restroom? Do you need insurance or equipment documents?</p></li></ul><p class="help">This lot is not confirmed for food sales. The host or agency must confirm what you need.</p></details>`;
          })
          .join("")
      : '<p class="help">Choose a service location in Shift Planner first.</p>';
  }
  function locationMapLinks(p) {
    return `<div class="location-map-links" aria-label="Maps for ${safe(p.name)}"><a data-map-provider="google" href="${safe(googleLink(p, state.origin, true))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${safe(p.name)} in Google Maps (new tab)">Google Maps ↗</a><a data-map-provider="apple" href="${safe(appleLink(p, state.origin, true))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${safe(p.name)} in Apple Maps (new tab)">Apple Maps ↗</a></div>`;
  }
  let mapAccountTrigger = null;
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[data-map-provider]");
    if (
      !link ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    const google = link.dataset.mapProvider === "google";
    mapAccountTrigger = link;
    $("mapAccountTitle").textContent = google
      ? "Google Maps Directions"
      : "Apple Maps Directions";
    $("mapAccountDescription").textContent = google
      ? "Open your route with your existing Google Maps session, or sign in to Google first."
      : "Open this route in Apple Maps. On your Apple device, Maps uses the Apple Account configured in Settings. Sign-in is not required for directions.";
    $("mapAccountContinue").href = link.href;
    $("mapAccountContinue").textContent = google
      ? "Open Google Maps Directions ↗"
      : "Open Apple Maps Directions ↗";
    const login = new URL("https://accounts.google.com/ServiceLogin");
    login.searchParams.set("continue", link.href);
    $("mapAccountSignIn").href = google
      ? login.href
      : "https://support.apple.com/en-us/111001";
    $("mapAccountSignIn").textContent = google
      ? "Sign In to Google & Open Route ↗"
      : "Apple Account Sign-In Help ↗";
    $("mapAccountDialog").showModal();
  });
  $("closeMapAccount").onclick = () => $("mapAccountDialog").close();
  $("mapAccountContinue").onclick = $("mapAccountSignIn").onclick = () =>
    $("mapAccountDialog").close();
  $("mapAccountDialog").addEventListener("close", () =>
    mapAccountTrigger?.focus({ preventScroll: true }),
  );
  function cardHTML(p) {
    const known = !!p.traffic,
      why =
        state.sortBy === "history"
          ? p.history.shifts
            ? `${p.history.shifts} recorded shift${p.history.shifts === 1 ? "" : "s"} at this lot · ${p.history.ordersPerHour.toFixed(1)} orders per service hour for this menu.`
            : p.publishedHistory?.length
              ? "Published past food-truck event evidence. See the linked record for the lot or venue scope."
              : known
                ? "Ranked using historical road exposure, then distance. No recorded truck shifts at this lot."
                : "No recorded shift, published event or nearby road-count evidence. Ranked by distance."
          : state.sortBy === "traffic" && known
            ? `Closest measured road: ${safe(roadName(p.traffic.name))} · ${p.traffic.distance.toFixed(2)} mi from this venue.`
            : state.sortBy === "reviews" && Number.isFinite(p.reviewCount)
              ? `${count(p.reviewCount)} Google Reviews returned for this place.`
              : `Ranked #${p.rank} by distance among your matching Irvine ${p.parking ? "parking sites" : "venues"}.`;
    return `<article class="venue-card ${p.id === selected ? "selected" : ""}" id="card-${safe(p.id)}"><div class="venue-top"><div class="venue-rank">${p.rank}</div><div><h3 class="venue-title">${safe(p.name)}</h3><div class="venue-category">${safe(CATEGORY_NAMES[p.category])}</div></div><div class="venue-distance">${p.distance.toFixed(1)} mi<small>straight-line</small></div></div><p class="venue-address">${safe(p.address || "Irvine, California · mapped venue reference")}</p><div class="venue-evidence">${p.parking ? `<span class="evidence-pill">Surface Lot · Access: ${safe(accessText(p.parking.access))}</span><span class="evidence-pill unknown">Truck Access: ${safe(accessText(p.parking.hgv))}</span>${p.history.shifts ? `<span class="evidence-pill">${p.history.shifts} shift${p.history.shifts === 1 ? "" : "s"} · ${p.history.ordersPerHour.toFixed(1)} orders/h</span>` : ""}` : ""}${known ? `<span class="evidence-pill">${count(p.traffic.count)} vehicles/day · ${p.traffic.year} Road Count</span>` : '<span class="evidence-pill unknown">No Measured Road Within 0.15 mi</span>'}${p.restroomListed ? '<span class="evidence-pill">Restroom Listed by City</span>' : ""}${Number.isFinite(p.reviewCount) ? `<span class="evidence-pill">${count(p.reviewCount)} Google Reviews${p.rating ? " · " + p.rating + "/5" : ""}</span>` : ""}${p.openNow !== null && p.openNow !== undefined ? `<span class="evidence-pill">${p.openNow ? "Open Now" : "Closed Now"} · Provider Status</span>` : ""}${state.approvals[p.id]?.status === "confirmed" ? '<span class="evidence-pill">Your Approval Recorded</span>' : ""}</div><p class="venue-why">${why}</p>${parkingEvidenceHTML(p)}${locationMapLinks(p)}<div class="venue-actions"><button class="btn" data-plan="${safe(p.id)}">Plan This Shift →</button><button class="textbtn" data-detail="${safe(p.id)}">Why This Place ↗</button><button class="iconbtn ${state.saved.includes(p.id) ? "saved" : ""}" data-save="${safe(p.id)}" aria-label="${state.saved.includes(p.id) ? "Unsave" : "Save"} ${safe(p.name)}" aria-pressed="${state.saved.includes(p.id)}">${state.saved.includes(p.id) ? "★" : "☆"}</button></div><div class="venue-source">${p.sourceId === "google" ? '<span class="google-attribution" translate="no">Google Maps</span>' : safe(p.source)}<span>· Retrieved ${dateText(p.fetchedAt)}</span>${p.sourceURL ? `<a href="${safe(p.sourceURL)}" target="_blank" rel="noopener">Source ↗</a>` : ""}${(p.attributions || []).map((a) => (a.uri ? `<a href="${safe(a.uri)}" target="_blank" rel="noopener">${safe(a.name)}</a>` : "")).join("")}</div></article>`;
  }
  function parkingEvidenceHTML(p) {
    if (!p.parking) return "";
    return `<div class="parking-evidence"><p>${p.parking.operator ? "Operator: " + safe(p.parking.operator) + ". " : ""}Capacity: ${safe(p.parking.capacity)}.</p>${(p.publishedHistory || []).map((h) => `<p><a href="${safe(h.url)}" target="_blank" rel="noopener">${safe(h.title)} · ${safe(h.date)} ↗</a><br>${safe(h.detail)}</p>`).join("")}${p.history?.venueShifts ? `<p>${p.history.venueShifts} recorded shift${p.history.venueShifts === 1 ? "" : "s"} at the nearby venue; exact parking lot not recorded.</p>` : ""}<p>${state.approvals[p.id]?.status === "confirmed" ? "Your host approval is recorded for this lot." : "Vendor permission and truck fit need confirmation for this exact lot."}</p></div>`;
  }
  function emptyHTML() {
    if (state.origin && state.provider === "public" && !parking.elements.length)
      return '<div class="empty"><h3>Parking records unavailable.</h3><p>Refresh the parking data to find specific surface lots.</p></div>';
    if (!state.origin)
      return '<div class="empty"><h3>Start with your address.</h3><p>Your map and shortlist will update as soon as you select a match or use your current location.</p><button class="btn secondary" data-start>Choose a starting point →</button></div>';
    if (state.provider !== "public" && !providerPlaces)
      return '<div class="empty"><h3>Waiting for place results.</h3><p>Fresh results will appear here when the selected provider responds.</p></div>';
    const filters = $("savedOnly").checked || $("permissionOnly").checked;
    if (filters)
      return '<div class="empty"><h3>No venues match these filters.</h3><p>Turn off saved or approval filters, or choose a different venue type.</p></div>';
    return `<div class="empty"><h3>No matching mapped parking sites in this radius.</h3><p>Coverage is partial. Increase the radius, change your venue type, or choose a starting point closer to Irvine. Nearby cities are excluded.</p></div>`;
  }
  function selectPlace(id) {
    if (!visible.some((p) => p.id === id)) return;
    selected = id;
    state.budget.area = id;
    save();
    render();
    pins.get(id)?.openPopup?.();
  }
  function renderPlannerChoices() {
    const select = $("budgetArea"),
      previous = state.budget.area;
    const groups = new Map();
    const seen = new Set();
    for (const place of visible) {
      const [venue, ...parts] = place.name.split(" · ");
      const lot = parts.join(" · ") || venue;
      const key = `${place.name.toLowerCase().replace(/[^a-z0-9]/g, "")}:${place.lat.toFixed(5)}:${place.lon.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!groups.has(venue)) groups.set(venue, []);
      groups.get(venue).push({ place, lot });
    }
    select.innerHTML = visible.length
      ? [...groups]
          .map(
            ([venue, lots]) =>
              `<optgroup label="${safe(venue)}">${lots
                .map(
                  ({ place, lot }) =>
                    `<option value="${safe(place.id)}">${safe(lot)} · ${place.distance.toFixed(1)} mi</option>`,
                )
                .join("")}</optgroup>`,
          )
          .join("")
      : '<option value="">Choose an address and nearby venue first</option>';
    select.disabled = !visible.length;
    $("exportPlan").disabled = !visible.length;
    if (!visible.some((p) => p.id === state.budget.area))
      state.budget.area = visible[0]?.id || "";
    select.value = state.budget.area;
    if (state.budget.area !== previous) save();
    $("trafficStatus").textContent = state.origin
      ? `${visible.length} Nearby Locations · ${state.radius} Mile Radius · ${state.origin.label}`
      : "Use Location Research to select your starting point and radius.";
  }
  const travelCache = new Map();
  let travelKey = "",
    travelController = null;
  function currentTravel() {
    return travelCache.get(travelKey);
  }
  function syncTravel() {
    const p = visible.find((p) => p.id === state.budget.area),
      o = state.origin;
    const key = p && o ? `${o.lat},${o.lon}:${p.lat},${p.lon}` : "";
    if (
      key !== travelKey ||
      (key &&
        travelCache.get(key)?.fetchedAt &&
        Date.now() - travelCache.get(key).fetchedAt > 300000)
    ) {
      travelController?.abort();
      if (travelCache.get(travelKey)?.status === "loading")
        travelCache.delete(travelKey);
      travelKey = key;
      if (
        travelCache.get(key)?.fetchedAt &&
        Date.now() - travelCache.get(key).fetchedAt > 300000
      )
        travelCache.delete(key);
      if (key && !travelCache.has(key)) {
        if (travelCache.size >= 30)
          travelCache.delete(travelCache.keys().next().value);
        travelCache.set(key, { status: "loading" });
        travelController = new AbortController();
        loadTravel(key, o, p, travelController.signal);
      }
    }
    const t = currentTravel(),
      fuelPrice = state.budget.fuelPrice;
    $("fuelPrice").readOnly = false;
    $("fuelPriceStatus").textContent = "Enter your fuel price per gallon.";
    const miles =
      t?.status === "ready" ? t.miles : p && o ? p.distance * 2 * 1.3 : 0;
    state.budget.travel =
      Math.round((miles / state.budget.mpg) * fuelPrice * 100) / 100;
    $("travel").value = state.budget.travel.toFixed(2);
    $("travelSummary").textContent = !key
      ? "Choose a starting address and venue to calculate travel."
      : t?.status === "ready"
        ? `${miles.toFixed(1)} round-trip road miles · ${Math.ceil(t.seconds / 60)} min · ${(miles / state.budget.mpg).toFixed(2)} gallons. OSRM driving estimate; excludes traffic and truck restrictions.`
        : `${miles.toFixed(1)} estimated round-trip miles (straight-line × 1.3 each way). ${t?.status === "loading" ? "Checking road route…" : "Road routing unavailable."}`;
    save();
  }
  async function loadTravel(key, o, p, signal) {
    try {
      const coords = `${o.lon},${o.lat};${p.lon},${p.lat};${o.lon},${o.lat}`;
      const r = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
          credentials: "omit",
          referrerPolicy: "no-referrer",
        },
      );
      if (!r.ok) throw new Error("Routing unavailable");
      const data = await r.json(),
        route = data.routes?.[0];
      if (signal.aborted) return;
      if (
        data.code !== "Ok" ||
        !Number.isFinite(route?.distance) ||
        route.distance < 0 ||
        !Number.isFinite(route?.duration) ||
        route.duration < 0 ||
        !route.geometry?.coordinates?.length
      )
        throw new Error("Invalid route");
      const t = {
        fetchedAt: Date.now(),
        status: "ready",
        miles: route.distance / 1609.344,
        seconds: route.duration,
        line: route.geometry.coordinates,
      };
      travelCache.set(key, t);
      if (key === travelKey) renderBudget();
    } catch {
      if (!signal.aborted) {
        travelCache.set(key, {
          status: "unavailable",
          fetchedAt: Date.now(),
        });
      }
    }
    if (key === travelKey && !signal.aborted) renderBudget();
  }
  const orderQuotes = new Map(
    Object.entries(state.orderQuotes || {}).filter(
      ([, value]) => Number.isInteger(value) && value >= 0 && value <= 10000,
    ),
  );
  let activeForecastKey = "";
  function syncPlannerInputs() {
    const area = state.budget.area;
    const key = `${area}:${state.cuisine}:${state.slot}:${state.day}`;
    const forecast = forecastShiftOrders(state.logs, {
      area,
      cuisine: state.cuisine,
      slot: state.slot,
      day: state.day,
    });
    $("orders").readOnly = !!forecast;
    if (forecast) {
      state.budget.orders = forecast.orders;
      $("orders").value = forecast.orders;
      $("ordersStatus").textContent =
        `Automatic Estimate · ${forecast.shifts} matching recorded shifts · 3-hour service window. Actual demand may differ.`;
    } else {
      if (activeForecastKey !== key) {
        state.budget.orders = orderQuotes.get(key) ?? 80;
        $("orders").value = state.budget.orders;
      }
      $("ordersStatus").textContent = orderQuotes.has(key)
        ? "Saved estimate for this location, menu and service window."
        : "Enter your expected orders. 80 is a sample; no matching shift history yet.";
    }
    activeForecastKey = key;
  }

  function renderBudget() {
    syncPlannerInputs();
    syncTravel();
    const b = calculateBudget(state.budget);
    $("surplus").textContent = money(b.surplus);
    $("surplus").style.color = b.surplus >= 0 ? "var(--teal)" : "var(--error)";
    $("budgetRows").innerHTML = [
      ["Revenue Before Sales Tax", b.revenue],
      ["Food & Packaging", (-b.revenue * state.budget.food) / 100],
      ["Payment Processing", (-b.revenue * state.budget.payment) / 100],
      ["Fuel + Travel", -state.budget.travel],
      ["Operating Surplus", b.surplus],
    ]
      .map(
        ([k, v], i) =>
          `<div class="budgetrow ${i === 4 ? "total" : ""}"><span>${k}</span><strong>${money(v)}</strong></div>`,
      )
      .join("");
    const denominator = Math.max(b.revenue, b.variable + b.fixed, 1);
    $("budgetBar").innerHTML = [
      [b.variable, "#93aaa0"],
      [b.fixed, "#d7bb95"],
      [Math.max(b.surplus, 0), "#226d63"],
    ]
      .map(
        ([v, c]) =>
          `<span style="width:${(v / denominator) * 100}%;background:${c}"></span>`,
      )
      .join("");
    $("breakeven").textContent =
      b.breakeven === null
        ? "No finite break-even: variable costs consume the entire ticket."
        : `Break-even: ${b.breakeven} orders at ${money(state.budget.ticket)} per ticket. Contribution per order: $${b.unit.toFixed(2)}.`;
    $("scenarios").innerHTML = [0.75, 1, 1.25]
      .map((m) => {
        const s = calculateBudget(
          state.budget,
          Math.round(state.budget.orders * m),
        );
        return `<div class="scenario"><small>${m === 1 ? "Base case" : m < 1 ? "25% fewer" : "25% more"}</small><strong>${money(s.surplus)}</strong><small>${s.orders} orders</small></div>`;
      })
      .join("");
    const p = visible.find((p) => p.id === state.budget.area);
    $("trafficDetail").hidden = !p;
    $("areaStatus").textContent = p
      ? approvalText(p.id)
      : "Select a nearby location to plan this shift.";
    if (p)
      $("trafficDetail").innerHTML =
        `<div class="planner-place-heading"><strong>${safe(p.name)}</strong><span class="badge blue">${p.distance.toFixed(1)} mi</span></div><p class="planner-place-address">${safe(p.address)} <span>· Straight-line distance</span></p><p class="planner-place-permission">${state.approvals[p.id]?.status === "confirmed" ? "Your host approval is recorded for this lot." : "Confirm host permission and truck access before booking."}</p><div class="location-map-links"><a href="${safe(googleLink(p, state.origin, true))}" target="_blank" rel="noopener">Google Route ↗</a><a href="${safe(appleLink(p, state.origin, true))}" target="_blank" rel="noopener">Apple Route ↗</a></div><details class="planner-place-sources"><summary>Parking Details & Past Events</summary>${parkingEvidenceHTML(p)}<p class="planner-place-source">${p.traffic ? count(p.traffic.count) + " vehicles/day on " + safe(roadName(p.traffic.name)) + " · " + p.traffic.year : "Nearby road traffic count not reported"}<br>${safe(p.source)}</p></details>`;
  }
  function readBudget() {
    if (!$("budgetForm").checkValidity()) return false;
    for (const k of Object.keys(DEFAULT.budget)) {
      state.budget[k] =
        k === "area" ? $("budgetArea").value : Number($(k).value);
    }
    save();
    return true;
  }
  function renderCatalogChoices() {
    const options = dedupePlaces([...catalog.places, ...allPlaces()]).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    for (const id of ["logArea"]) {
      const previous = $(id).value;
      $(id).innerHTML = options.length
        ? options
            .map(
              (p) => `<option value="${safe(p.id)}">${safe(p.name)}</option>`,
            )
            .join("")
        : '<option value="">No locations available</option>';
      $(id).disabled = !options.length;
      if (options.some((p) => p.id === previous)) $(id).value = previous;
      else if (options.some((p) => p.id === state.budget.area))
        $(id).value = state.budget.area;
    }
    renderLogs();
  }
  function renderLogs() {
    const total = state.logs.reduce((s, l) => s + l.orders, 0),
      hours = state.logs.reduce((s, l) => s + l.hours, 0);
    $("logSummary").innerHTML = state.logs.length
      ? `<span class="badge">Your observations</span><p class="help">${state.logs.length} shift${state.logs.length === 1 ? "" : "s"} · ${total} orders · ${(total / hours).toFixed(1)} orders per service hour overall</p>`
      : '<p class="help">Record completed shifts to build evidence of customer demand.</p>';
    $("logs").innerHTML = state.logs
      .slice()
      .reverse()
      .map(
        (l) =>
          `<div class="logentry"><div><strong>${safe(findPlace(l.area)?.name || l.areaName || l.area)}</strong><small>${safe(l.date)} · ${safe(names[l.cuisine] || l.cuisine)} · ${l.orders} orders / ${l.hours}h${l.slot ? " · " + safe(serviceNames[l.day] || l.day) + " · " + safe(serviceNames[l.slot] || l.slot) : ""}</small>${l.notes ? `<small>${safe(l.notes)}</small>` : ""}</div><button class="textbtn" data-remove="${safe(l.id)}" aria-label="Remove shift on ${safe(l.date)}">Remove</button></div>`,
      )
      .join("");
  }
  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportPlan() {
    if (!readBudget()) {
      $("budgetForm").reportValidity();
      return;
    }
    const p = visible.find((p) => p.id === state.budget.area);
    if (!p) {
      toast("Select a nearby venue first.");
      return;
    }
    syncTravel();
    const b = calculateBudget(state.budget);
    download(
      "city-fit-irvine-shift-plan.pdf",
      createShiftPlanPDF({
        place: p,
        origin: state.origin.label,
        date: new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          dateStyle: "medium",
        }).format(new Date()),
        service: `${serviceNames[state.day]} / ${serviceNames[state.slot]}`,
        menu: names[state.cuisine],
        orders: String(state.budget.orders),
        revenue: money(b.revenue),
        surplus: money(b.surplus),
        rows: [
          ["Average order value", money(state.budget.ticket)],
          [
            "Food & packaging",
            `${state.budget.food}% / ${money((b.revenue * state.budget.food) / 100)}`,
          ],
          [
            "Payment processing",
            `${state.budget.payment}% / ${money((b.revenue * state.budget.payment) / 100)}`,
          ],
          ["Fuel & travel", money(state.budget.travel)],
          [
            "Fuel price (assumption)",
            `$${state.budget.fuelPrice.toFixed(2)}/gal`,
          ],
          ["Truck fuel economy", `${state.budget.mpg} MPG`],
          [
            "Break-even orders",
            b.breakeven === null ? "Not finite" : String(b.breakeven),
          ],
        ],
        travel: $("travelSummary").textContent,
        checks: PERMITS.map(([id, label]) => ({
          label,
          done: !!state.checks[id],
        })),
        approval: approvalText(p.id),
        retrieved: dateText(p.fetchedAt),
        routes: [
          googleLink(p, state.origin, true),
          appleLink(p, state.origin, true),
        ],
      }),
      "application/pdf",
    );
    toast("Shift plan downloaded");
  }
  function detail(id) {
    const p = visible.find((p) => p.id === id);
    if (!p) return;
    selectPlace(id);
    detailReturnId = id;
    $("detailContent").innerHTML =
      `<div class="dialoghead"><div><div class="eyebrow">Irvine ${p.parking ? "parking site" : "venue"} / Rank ${p.rank}</div><h2>${safe(p.name)}</h2><span class="badge">${safe(CATEGORY_NAMES[p.category])}</span></div><button class="close" id="closeDetail" aria-label="Close venue details">×</button></div><p class="help" style="margin-top:15px">${safe(p.address)}</p><div class="detail-signals"><div><small>From Your Start</small><strong>${p.distance.toFixed(2)} mi</strong><small>Straight-Line Distance</small></div><div><small>Nearby Road Exposure</small><strong>${p.traffic ? count(p.traffic.count) : "Unknown"}</strong><small>${p.traffic ? "vehicles/day · " + p.traffic.year : "No Measured Road Within 0.15 mi"}</small></div></div>${parkingEvidenceHTML(p)}<h3>Why This Place?</h3><p class="help">This location is inside Irvine’s official boundary and your ${state.radius} Mile Radius. ${state.sortBy === "history" ? "It is ranked by recorded shift performance, published past events, historical Road Counts, and distance." : state.sortBy === "traffic" && p.traffic ? "It is ranked by the closest nearby measured Road Count." : state.sortBy === "reviews" ? "It is ranked by cumulative Google review count." : "It is ranked by reference-point distance from your confirmed starting location."}</p>${p.traffic ? `<p class="help">Nearest Measured Road: ${safe(roadName(p.traffic.name))}, ${p.traffic.distance.toFixed(2)} mi from this venue. The ${p.traffic.year} count is vehicle exposure, not venue visitors. <a href="${safe(p.traffic.source)}" target="_blank" rel="noopener">City Source ↗</a></p>` : ""}<p class="help">${safe(p.source)} · Retrieved ${dateText(p.fetchedAt)}. ${p.sourceURL ? `<a href="${safe(p.sourceURL)}" target="_blank" rel="noopener">Open Place Source ↗</a>` : ""}</p>${providers.googleRoutes || providers.appleRoutes ? `<div class="provider-routes"><strong>Travel Time</strong><div class="route-buttons">${providers.googleRoutes ? '<button class="btn secondary" id="googleETA">Get Google Travel Time</button>' : ""}${providers.appleRoutes ? '<button class="btn secondary" id="appleETA">Get Apple Travel Time</button>' : ""}</div><p id="routeResult">Choose a provider to estimate driving time.</p></div>` : ""}<div class="callout"><strong>${safe(approvalText(p.id))}</strong><p style="margin:6px 0 0">${safe(state.approvals[p.id]?.note || "Record the exact service site and host permission before booking.")}</p></div><div class="cardactions"><button class="btn" id="detailPlan">Plan This Shift →</button></div>`;
    $("closeDetail").onclick = () => $("detailDialog").close();
    $("detailPlan").onclick = () => {
      $("detailDialog").close();
      view("planner");
    };
    if (providers.googleRoutes)
      $("googleETA").onclick = () => loadRoute(p, "google");
    if (providers.appleRoutes)
      $("appleETA").onclick = () => loadRoute(p, "apple");
    $("detailDialog").showModal();
  }
  $("detailDialog").addEventListener("close", () => {
    routeVersion++;
    if (!$("locations").hidden && detailReturnId)
      document
        .querySelector(`[data-detail="${CSS.escape(detailReturnId)}"]`)
        ?.focus({ preventScroll: true });
  });
  async function loadRoute(p, provider) {
    const origin = { ...state.origin },
      version = ++routeVersion;
    $("routeResult").textContent = "Checking current driving time…";
    try {
      const q = new URLSearchParams({
          lat: origin.lat,
          lon: origin.lon,
          toLat: p.lat,
          toLon: p.lon,
          provider,
        }),
        r = await fetchJSON("/api/location/route?" + q);
      if (
        version !== routeVersion ||
        state.origin?.lat !== origin.lat ||
        state.origin?.lon !== origin.lon ||
        selected !== p.id
      )
        return;
      $("routeResult").textContent =
        `${r.provider}: ${Math.ceil(r.durationSeconds / 60)} min · ${(r.distanceMeters / 1609.344).toFixed(1)} driving mi${r.trafficAware ? " · traffic-aware" : ""}${r.baselineSeconds ? " · " + Math.max(0, Math.round((r.durationSeconds - r.baselineSeconds) / 60)) + " min above baseline" : ""}. Retrieved now.`;
    } catch {
      if (
        version !== routeVersion ||
        selected !== p.id ||
        state.origin?.lat !== origin.lat ||
        state.origin?.lon !== origin.lon ||
        !$("detailDialog").open
      )
        return;
      $("routeResult").textContent =
        "Travel Time is unavailable. Open the provider map to check the route.";
    }
  }
  function initMap() {
    if (!window.L) {
      $("mapFallback").hidden = false;
      return;
    }
    const L = window.L;
    map = L.map("discoveryMap", {
      scrollWheelZoom: false,
      zoomControl: true,
      zoomAnimation: false,
    }).setView([CITY_CENTER.lat, CITY_CENTER.lon], 12);
    let errors = 0;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    })
      .on("tileerror", () => {
        if (++errors >= 4) $("mapFallback").hidden = false;
      })
      .on("tileload", () => {
        $("mapFallback").hidden = true;
      })
      .addTo(map);
    pinLayer = L.layerGroup().addTo(map);
    originLayer = L.layerGroup().addTo(map);
    boundaryLayer = L.layerGroup().addTo(map);
    parkingLayer = L.layerGroup().addTo(map);
    roadLayer = L.layerGroup().addTo(map);
    $("discoveryMap").addEventListener("click", (e) => {
      const b = e.target.closest?.("[data-map-place]");
      if (b) selectPlace(b.dataset.mapPlace);
    });
  }
  function fitMap() {
    if (!map) return;
    map.invalidateSize();
    if (!state.origin) {
      map.setView([CITY_CENTER.lat, CITY_CENTER.lon], 12);
      return;
    }
    const L = window.L;
    const bounds = L.latLngBounds();
    const radiusBounds = L.latLng(state.origin.lat, state.origin.lon).toBounds(
      state.radius * 1609.344 * 2,
    );
    bounds.extend([state.origin.lat, state.origin.lon]);
    bounds.extend(radiusBounds);
    for (const place of visible) bounds.extend([place.lat, place.lon]);
    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 12,
      animate: false,
    });
  }
  function renderMap() {
    const publicSource = state.provider === "public";
    $("discoveryMap").hidden = !publicSource;
    $("providerMapHandoff").hidden = publicSource;
    $("resetMap").hidden = !publicSource;
    if (!publicSource) {
      const provider =
        state.provider === "google" ? "Google Maps" : "Apple Maps";
      $("providerMapHandoff").innerHTML =
        `<strong>${provider} results</strong><p>Inspect each venue in its source map.</p>${visible.map((p) => `<a href="${safe(state.provider === "google" ? googleLink(p, state.origin) : appleLink(p, state.origin))}" target="_blank" rel="noopener">${p.rank}. ${safe(p.name)} ↗</a>`).join("")}`;
      return;
    }
    if (!map) return;
    const L = window.L;
    pinLayer.clearLayers();
    originLayer.clearLayers();
    boundaryLayer.clearLayers();
    parkingLayer.clearLayers();
    roadLayer.clearLayers();
    pins.clear();
    if (boundary)
      L.geoJSON(boundary, {
        style: {
          color: "#506b47",
          weight: 1.2,
          fillColor: "#d8ef80",
          fillOpacity: 0.06,
          dashArray: "5 5",
        },
        interactive: false,
      }).addTo(boundaryLayer);
    if (state.origin) {
      L.circle([state.origin.lat, state.origin.lon], {
        radius: state.radius * 1609.344,
        color: "#718d4d",
        weight: 1,
        dashArray: "6 5",
        fillColor: "#d8ef80",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(originLayer);
      L.marker([state.origin.lat, state.origin.lon], {
        icon: L.divIcon({
          className: "",
          html: '<div class="origin-pin"></div>',
          iconSize: [17, 17],
          iconAnchor: [8, 8],
        }),
        title: "Your starting point",
      })
        .bindPopup("<strong>" + safe(state.origin.label) + "</strong>")
        .addTo(originLayer);
    }
    const roads = new Set();
    for (const p of visible) {
      if (p.parking?.geometry)
        L.geoJSON(p.parking.geometry, {
          style: {
            color: p.id === selected ? "#226d63" : "#768e54",
            weight: p.id === selected ? 3 : 1.5,
            fillOpacity: p.id === selected ? 0.3 : 0.12,
          },
          interactive: false,
        }).addTo(parkingLayer);
      if (p.traffic && !roads.has(p.traffic.id)) {
        roads.add(p.traffic.id);
        for (const line of p.traffic.lines || [])
          L.polyline(
            line.map((c) => [c[1], c[0]]),
            { color: "#cb863b", weight: 4, opacity: 0.7 },
          )
            .bindTooltip(
              `${safe(roadName(p.traffic.name))} · ${count(p.traffic.count)} vehicles/day · ${p.traffic.year}`,
            )
            .addTo(roadLayer);
      }
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div class="venue-pin ${p.id === selected ? "active" : ""}">${p.rank}</div>`,
          iconSize: [31, 35],
          iconAnchor: [15, 35],
        }),
        title: p.rank + ". " + p.name,
      })
        .bindPopup(
          `<h3>${safe(p.name)}</h3><p>${p.parking ? "Surface parking lot" : safe(CATEGORY_NAMES[p.category])} · ${p.distance.toFixed(1)} mi</p>${p.parking ? `<p>Access: ${safe(accessText(p.parking.access))} · truck access: ${safe(accessText(p.parking.hgv))}</p><p>${p.history.shifts ? p.history.shifts + (p.history.shifts === 1 ? " recorded shift" : " recorded shifts") : p.publishedHistory?.length ? "Published event history" : "No recorded truck shifts"}</p>` : ""}${locationMapLinks(p)}<button data-map-place="${safe(p.id)}">Select for shift plan →</button>`,
        )
        .addTo(pinLayer);
      marker.on("click", () => {
        selected = p.id;
        state.budget.area = p.id;
        save();
        renderBudget();
        renderMap();
        pins.get(p.id)?.openPopup();
        document
          .querySelectorAll(".venue-card")
          .forEach((c) =>
            c.classList.toggle("selected", c.id === "card-" + p.id),
          );
        $("card-" + p.id)?.scrollIntoView({
          block: "nearest",
          behavior: reducedMotion() ? "auto" : "smooth",
        });
      });
      pins.set(p.id, marker);
    }
    $("mapSubtitle").textContent = state.origin
      ? `${visible.length} Ranked ${state.provider === "public" ? "Parking Lots" : "Venues"} · ${state.radius} Mile Radius · ${traffic.year || "Historical"} Road Counts`
      : "Set a starting point to draw your radius.";
  }
  async function refreshPublicSources() {
    const parkingResult = await Promise.allSettled([
      fetchJSON(
        staticHosting ? "./parking-snapshot.json" : "/api/location/parking",
      ),
    ]);
    if (parkingResult[0].status === "fulfilled") {
      parking = {
        ...parkingResult[0].value,
        ...(staticHosting ? { status: "snapshot" } : {}),
      };
    }
    const results = await Promise.allSettled([
      fetchJSON(
        staticHosting ? "./catalog-snapshot.json" : "/api/location/catalog",
      ),
      fetchJSON(
        staticHosting ? "./traffic-snapshot.json" : "/api/location/traffic",
      ),
    ]);
    if (results[0].status === "fulfilled") {
      catalog = {
        ...results[0].value,
        ...(staticHosting ? { status: "snapshot" } : {}),
      };
      catalog.places = dedupePlaces(catalog.places || []);
    }
    if (results[1].status === "fulfilled")
      traffic = {
        ...results[1].value,
        ...(staticHosting ? { status: "snapshot" } : {}),
      };
    render();
  }
  async function refreshProvider() {
    providerController?.abort();
    const version = ++providerVersion;
    if (state.provider === "public") {
      providerPlaces = null;
      render();
      return;
    }
    if (!state.origin) return;
    const provider = state.provider,
      origin = { ...state.origin },
      radius = state.radius,
      controller = new AbortController();
    providerController = controller;
    providerPlaces = null;
    render();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const q = new URLSearchParams({
          provider,
          lat: origin.lat,
          lon: origin.lon,
          radius,
        }),
        data = await fetchJSON("/api/location/places?" + q, controller.signal);
      if (version !== providerVersion) return;
      providerPlaces = data;
      render();
    } catch {
      if (version !== providerVersion) return;
      providerPlaces = { places: [], status: "unavailable", fetchedAt: null };
      render();
      $("resultDescription").textContent =
        "The selected source is unavailable. Choose Mapped surface parking or retry.";
      toast("Map source unavailable. Public venue records are available.");
    } finally {
      clearTimeout(timer);
    }
  }
  async function loadProviders() {
    try {
      if (!staticHosting) providers = await fetchJSON("/api/location/status");
    } catch {}
    $("placeProvider").innerHTML =
      `<option value="public">Mapped surface parking</option><option value="google" ${providers.google ? "" : "disabled"}>Google Maps${providers.google ? "" : " · not connected"}</option><option value="apple" ${providers.apple ? "" : "disabled"}>Apple Maps${providers.apple ? "" : " · not connected"}</option>`;
    if (
      (state.provider === "google" && !providers.google) ||
      (state.provider === "apple" && !providers.apple)
    )
      state.provider = "public";
    if (state.sortBy === "reviews" && state.provider !== "google")
      state.sortBy = "nearest";
    $("placeProvider").value = state.provider;
    syncSort();
    save();
    updateSourceStatus();
    if (state.provider !== "public") await refreshProvider();
  }
  function syncSort() {
    $("sortAreas").innerHTML =
      `<option value="history">Past shift & event evidence</option><option value="nearest">Closest first</option><option value="traffic">Measured road traffic · historical</option><option value="reviews" ${state.provider === "google" ? "" : "disabled"}>Google review count</option>`;
    if (state.sortBy === "reviews" && state.provider !== "google")
      state.sortBy = "nearest";
    $("sortAreas").value = state.sortBy;
  }
  let addressTimer,
    addressController,
    addressVersion = 0,
    addressCandidates = [],
    activeSuggestion = -1,
    currentLocationRequest = null;
  const addressCache = new Map();
  function addressStatus(msg, error = false) {
    $("addressStatus").textContent = msg;
    $("addressStatus").classList.toggle("error", error);
  }
  function hideSuggestions() {
    $("addressSuggestions").hidden = true;
    $("startAddress").setAttribute("aria-expanded", "false");
    $("startAddress").removeAttribute("aria-activedescendant");
    activeSuggestion = -1;
  }
  function scrollToMap() {
    view("locations");
    requestAnimationFrame(() => {
      map?.invalidateSize();
      fitMap();
      $("mapTitle").focus({ preventScroll: true });
      document.querySelector(".map-panel").scrollIntoView({
        block: "start",
        behavior: reducedMotion() ? "auto" : "smooth",
      });
    });
  }
  function setOrigin(origin) {
    geolocationVersion++;
    state.origin = { ...origin };
    $("startAddress").value = origin.label;
    hideSuggestions();
    save();
    render();
    requestAnimationFrame(() => {
      map?.invalidateSize();
      fitMap();
    });
    requestAnimationFrame(() => {
      map?.invalidateSize();
      fitMap();
    });
    addressStatus("Using " + origin.label + ". " + origin.precision + ".");
    refreshProvider();
    scrollToMap();
  }
  function selectOrigin(index) {
    const origin = addressCandidates[index];
    if (!origin) return;
    addressVersion++;
    clearTimeout(addressTimer);
    addressController?.abort();
    $("findAddress").disabled = false;
    setOrigin(origin);
  }
  function showSuggestions(items) {
    addressCandidates = items;
    activeSuggestion = -1;
    $("addressSuggestions").innerHTML = items
      .map(
        (o, i) =>
          `<button type="button" tabindex="-1" class="suggestion" id="address-option-${i}" role="option" aria-selected="false" data-address-index="${i}"><strong>${safe(o.label)}</strong><small>${safe(o.precision)} · select this match</small></button>`,
      )
      .join("");
    $("addressSuggestions").hidden = !items.length;
    $("startAddress").setAttribute(
      "aria-expanded",
      items.length ? "true" : "false",
    );
    addressStatus(
      items.length
        ? "Select the intended address. Your entry will be replaced with that match."
        : "No address-level match. Add a street, city and ZIP, or try a landmark.",
      !items.length,
    );
  }
  async function searchAddress() {
    clearTimeout(addressTimer);
    if (currentLocationRequest) {
      try {
        await currentLocationRequest;
      } catch {
        return;
      }
    }
    const q = $("startAddress").value.trim();
    if (state.origin && q === state.origin.label) {
      addressVersion++;
      addressController?.abort();
      $("findAddress").disabled = false;
      setOrigin(state.origin);
      return;
    }
    if (q.length < 3) {
      addressStatus("Enter a street, city, or nearby landmark.");
      return;
    }
    addressController?.abort();
    const version = ++addressVersion;
    if (addressCache.has(q.toLowerCase())) {
      showSuggestions(addressCache.get(q.toLowerCase()));
      $("findAddress").disabled = false;
      return;
    }
    const controller = new AbortController();
    addressController = controller;
    const timer = setTimeout(() => controller.abort(), 12000);
    $("findAddress").disabled = true;
    addressStatus("Finding address matches…");
    try {
      const params = new URLSearchParams({
          q,
          limit: "8",
          lat: "33.6846",
          lon: "-117.8265",
          lang: "en",
          countrycode: "US",
        }),
        r = await fetch("https://photon.komoot.io/api/?" + params, {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      if (!r.ok) throw new Error("Lookup failed");
      const items = parseAddressResults(await r.json());
      if (version !== addressVersion) return;
      addressCache.set(q.toLowerCase(), items);
      showSuggestions(items);
    } catch {
      if (version === addressVersion) {
        hideSuggestions();
        addressStatus(
          "Address search is unavailable. Try Current Location, a nearby landmark, or Irvine City Hall.",
          true,
        );
      }
    } finally {
      clearTimeout(timer);
      if (version === addressVersion) $("findAddress").disabled = false;
    }
  }
  function clearOrigin() {
    providerVersion++;
    providerController?.abort();
    geolocationVersion++;
    state.origin = null;
    providerPlaces = null;
    state.budget.area = "";
    $("startAddress").value = "";
    save();
    render();
    fitMap();
  }
  $("startAddress").value = state.origin?.label || "";
  $("mileRadius").value = state.radius;
  $("venueCategory").value = state.category;
  syncSort();
  if (state.origin)
    addressStatus(
      "Using " +
        state.origin.label +
        ". " +
        (state.origin.precision || "Confirmed starting point") +
        ".",
    );
  $("startAddress").oninput = () => {
    addressVersion++;
    addressController?.abort();
    clearTimeout(addressTimer);
    hideSuggestions();
    $("findAddress").disabled = false;
    geolocationVersion++;
    if (state.origin) {
      state.origin = null;
      providerVersion++;
      providerController?.abort();
      providerPlaces = null;
      save();
      render();
    }
    if ($("startAddress").value.trim().length < 3) {
      addressStatus("Choose a matching address to update the results.");
      return;
    }
    addressStatus("Looking for address matches…");
    addressTimer = setTimeout(searchAddress, 700);
  };
  $("startAddress").onkeydown = (e) => {
    if (
      ["ArrowDown", "ArrowUp"].includes(e.key) &&
      !$("addressSuggestions").hidden &&
      addressCandidates.length
    ) {
      e.preventDefault();
      activeSuggestion =
        e.key === "ArrowDown"
          ? (activeSuggestion + 1) % addressCandidates.length
          : activeSuggestion < 0
            ? addressCandidates.length - 1
            : (activeSuggestion - 1 + addressCandidates.length) %
              addressCandidates.length;
      document.querySelectorAll("[data-address-index]").forEach((b, i) => {
        b.classList.toggle("selected", i === activeSuggestion);
        b.setAttribute("aria-selected", String(i === activeSuggestion));
      });
      $("startAddress").setAttribute(
        "aria-activedescendant",
        "address-option-" + activeSuggestion,
      );
      $("address-option-" + activeSuggestion)?.scrollIntoView({
        block: "nearest",
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestion >= 0 && !$("addressSuggestions").hidden)
        selectOrigin(activeSuggestion);
      else searchAddress();
    } else if (e.key === "Escape") hideSuggestions();
  };
  $("startAddress").onblur = () =>
    setTimeout(() => {
      if (document.activeElement !== $("startAddress")) hideSuggestions();
    }, 150);
  $("addressSuggestions").onpointerdown = (e) => e.preventDefault();
  $("addressSuggestions").onclick = (e) => {
    const b = e.target.closest("[data-address-index]");
    if (b) selectOrigin(Number(b.dataset.addressIndex));
  };
  $("findAddress").onclick = searchAddress;
  $("useLocation").onclick = async () => {
    addressVersion++;
    addressController?.abort();
    clearTimeout(addressTimer);
    hideSuggestions();
    $("findAddress").disabled = false;
    const version = ++geolocationVersion;
    $("useLocation").disabled = true;
    addressStatus(
      "Allow location access in your browser to find your current location…",
    );
    try {
      currentLocationRequest = resolveCurrentLocation();
      const origin = await currentLocationRequest;
      if (version !== geolocationVersion) return;
      $("useLocation").disabled = false;
      if (origin) setOrigin(origin);
      else
        addressStatus(
          "Device location is unavailable. Enter an address instead.",
          true,
        );
    } catch (error) {
      $("useLocation").disabled = false;
      if (version !== geolocationVersion) return;
      addressStatus(
        error.message || "Current location is unavailable. Enter your address.",
        true,
      );
    } finally {
      currentLocationRequest = null;
      $("useLocation").disabled = false;
    }
  };
  $("exampleOrigin").onclick = () => {
    addressVersion++;
    addressController?.abort();
    clearTimeout(addressTimer);
    $("findAddress").disabled = false;
    setOrigin({
      label: "1 Civic Center Plaza, Irvine, CA 92606",
      lat: 33.6859574,
      lon: -117.8261275,
      precision: "Irvine City Hall Example",
    });
  };
  $("clearOrigin").onclick = () => {
    addressVersion++;
    addressController?.abort();
    clearTimeout(addressTimer);
    hideSuggestions();
    $("findAddress").disabled = false;
    clearOrigin();
    addressStatus("Choose a new starting point.");
  };
  $("mileRadius").oninput = () => {
    state.radius = Number($("mileRadius").value);
    save();
    render();
    fitMap();
    clearTimeout(radiusTimer);
    if (state.provider !== "public") {
      providerVersion++;
      providerController?.abort();
      radiusTimer = setTimeout(refreshProvider, 300);
    }
  };
  $("sortAreas").onchange = () => {
    state.sortBy = $("sortAreas").value;
    save();
    render();
    fitMap();
  };
  $("venueCategory").onchange = () => {
    state.category = $("venueCategory").value;
    save();
    render();
    fitMap();
  };
  $("savedOnly").onchange = $("permissionOnly").onchange = () => {
    render();
    fitMap();
  };
  $("placeProvider").onchange = () => {
    state.provider = $("placeProvider").value;
    syncSort();
    save();
    refreshProvider();
  };
  $("refreshPlaces").onclick = async () => {
    $("refreshPlaces").disabled = true;
    $("refreshPlaces").textContent = "Refreshing…";
    try {
      await refreshPublicSources();
      await refreshProvider();
      fitMap();
      toast(
        parking.status === "snapshot"
          ? "Saved parking records reloaded. Coverage and retrieval dates are shown on the map."
          : "Place sources refreshed.",
      );
    } finally {
      $("refreshPlaces").disabled = false;
      $("refreshPlaces").textContent = "↻ Reload Records";
    }
  };
  $("resetMap").onclick = fitMap;
  $("serviceStartDate").value = state.serviceStartDate;
  $("serviceEndDate").value = state.serviceEndDate;
  $("serviceStartTime").value = state.serviceStartTime;
  $("serviceEndTime").value = state.serviceEndTime;
  $("serviceStartDate").onchange = () => {
    const endValue = $("serviceEndDate").value;
    if (!$("serviceStartDate").value) {
      state.serviceStartDate = "";
      state.serviceEndDate = "";
      state.serviceSelectedDates = [];
      save();
      return;
    }
    const start = $("serviceStartDate").value;
    const end = endValue && endValue < start ? start : endValue || start;
    updateServiceRange(start, end);
  };
  $("serviceEndDate").onchange = () => {
    const startValue = $("serviceStartDate").value;
    if (!$("serviceEndDate").value) {
      state.serviceEndDate = "";
      state.serviceSelectedDates = startValue ? [startValue] : [];
      save();
      return;
    }
    const end = $("serviceEndDate").value;
    const start = startValue || end;
    updateServiceRange(start, end);
  };
  $("serviceStartTime").onchange = () => {
    state.serviceStartTime = $("serviceStartTime").value || "11:00";
    save();
  };
  $("serviceEndTime").onchange = () => {
    state.serviceEndTime = $("serviceEndTime").value || "14:00";
    save();
  };
  for (const k of Object.keys(DEFAULT.budget).filter((k) => k !== "area"))
    $(k).value = state.budget[k];
  $("fuelType").value = state.fuelType;
  $("fuelType").onchange = () => {
    state.fuelType = $("fuelType").value;
    save();
    renderBudget();
  };
  $("budgetForm").oninput = (e) => {
    const input = e.target,
      key = input.id;
    if (key === "budgetArea") {
      state.budget.area = input.value;
      selected = input.value;
      save();
      render();
      return;
    }
    if (
      !Object.hasOwn(DEFAULT.budget, key) ||
      key === "travel" ||
      input.readOnly ||
      input.value === "" ||
      !input.checkValidity()
    )
      return;
    if (key === "orders") {
      orderQuotes.set(activeForecastKey, Number(input.value));
      state.orderQuotes = Object.fromEntries(orderQuotes);
    }
    state.budget[key] = Number(input.value);
    save();
    renderBudget();
  };
  $("budgetForm").onsubmit = (e) => e.preventDefault();
  $("plannerLocation").onclick = () => {
    view("locations");
    $("startAddress").focus();
    $("startAddress").scrollIntoView({ block: "center" });
  };
  $("cards").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.save) {
      state.saved = state.saved.includes(b.dataset.save)
        ? state.saved.filter((id) => id !== b.dataset.save)
        : [...state.saved, b.dataset.save];
      save();
      render();
    } else if (b.dataset.plan) {
      selectPlace(b.dataset.plan);
      view("planner");
    } else if (b.dataset.detail) detail(b.dataset.detail);
    else if (b.hasAttribute("data-start")) $("startAddress").focus();
  };
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => (b.onclick = () => view(b.dataset.view)));
  document.querySelectorAll("[data-open-view]").forEach((link) => {
    link.onclick = (event) => {
      event.preventDefault();
      $("profileDialog").close();
      view(link.dataset.openView);
    };
  });
  window.addEventListener("hashchange", () => view(location.hash.slice(1)));
  if (viewIds.has(location.hash.slice(1))) view(location.hash.slice(1));
  $("heroPlan").onclick = $("sidePlan").onclick = () => view("planner");
  $("changePermitLocation").onclick = () => {
    view("planner");
    $("budgetArea").focus();
  };
  $("permitItems").innerHTML = PERMITS.map(
    ([id, title, desc, url], index) =>
      `<div class="permit"><input type="checkbox" id="check-${id}" data-check="${id}" ${state.checks[id] ? "checked" : ""} aria-label="Record preparation for ${safe(title)}"><div><label for="check-${id}"><h3>${index + 1}. ${safe(title)}</h3></label><p>${safe(desc)}</p></div><a href="${url}" target="_blank" rel="noopener">Learn how ↗</a></div>`,
  ).join("");
  $("permitItems").onchange = (e) => {
    if (e.target.dataset.check) {
      state.checks[e.target.dataset.check] = e.target.checked;
      save();
      render();
    }
  };
  $("logDate").value = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
  $("logForm").onsubmit = (e) => {
    e.preventDefault();
    if (!$("logForm").reportValidity() || !$("logArea").value) return;
    state.logs.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      area: $("logArea").value,
      areaName: findPlace($("logArea").value)?.name || $("logArea").value,
      date: $("logDate").value,
      cuisine: $("logCuisine").value,
      slot: state.slot,
      day: state.day,
      orders: Number($("logOrders").value),
      hours: Number($("logHours").value),
      notes: $("logNotes").value.trim(),
    });
    save();
    render();
    $("logOrders").value = "";
    $("logHours").value = "";
    $("logNotes").value = "";
    toast("Actual shift recorded");
  };
  $("logs").onclick = (e) => {
    const b = e.target.closest("[data-remove]");
    if (b) {
      state.logs = state.logs.filter((l) => l.id !== b.dataset.remove);
      save();
      render();
      fitMap();
    }
  };
  $("exportPlan").onclick = exportPlan;
  $("exportLog").onclick = () => {
    if (!state.logs.length) {
      toast("Record a shift before exporting.");
      return;
    }
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&") +
      '"';
    download(
      "city-fit-irvine-shift-log.csv",
      [
        [
          "Date",
          "Venue",
          "Place ID",
          "Menu",
          "Day",
          "Window",
          "Orders",
          "Hours",
          "Orders per hour",
          "Observations",
        ],
        ...state.logs.map((l) => [
          l.date,
          findPlace(l.area)?.name || l.areaName || l.area,
          l.area,
          names[l.cuisine],
          l.day,
          l.slot,
          l.orders,
          l.hours,
          (l.orders / l.hours).toFixed(2),
          l.notes,
        ]),
      ]
        .map((r) => r.map(cell).join(","))
        .join("\r\n"),
      "text/csv",
    );
  };
  const sourceRows = [
    {
      title: "Parking Lots",
      tag: "OpenStreetMap",
      type: "blue",
      desc: "Mapped lots, outlines and access tags. Partial Irvine coverage.",
      url: "./parking-snapshot.json",
      date: "Retrieval dates shown on results",
    },
    {
      title: "Road Traffic",
      tag: "City of Irvine",
      type: "blue",
      desc: "Historical vehicle counts matched to roads within 0.15 miles.",
      url: "https://gis.cityofirvine.org/arcgis/rest/services/ADT/MapServer",
      date: "Measurement year shown with each count",
    },
    {
      title: "Past Events And Shifts",
      tag: "Historical Evidence",
      type: "blue",
      desc: "Published event links appear on lot cards. Your shift logs provide orders per hour.",
      url: null,
      date: "Nearby events do not confirm exact-lot use",
    },
  ];
  $("sourceCards").innerHTML = sourceRows
    .map(
      (s) =>
        `<article class="source"><span class="badge ${s.type}">${safe(s.tag)}</span><h3>${safe(s.title)}</h3><p>${safe(s.desc)}</p>${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">Open source ↗</a>` : '<button class="textbtn" id="sourceLog">Record a shift →</button>'}<small>${safe(s.date)}</small></article>`,
    )
    .join("");
  if ($("sourceLog")) $("sourceLog").onclick = () => view("planner");
  const data = await Promise.allSettled([
    fetchJSON("./catalog-snapshot.json"),
    fetchJSON("./traffic-snapshot.json"),
    fetchJSON("./irvine-boundary.json"),
    fetchJSON("./parking-snapshot.json"),
  ]);
  if (data[0].status === "fulfilled")
    catalog = { ...data[0].value, status: "snapshot" };
  if (data[1].status === "fulfilled")
    traffic = { ...data[1].value, status: "snapshot" };
  if (data[2].status === "fulfilled") boundary = data[2].value;
  if (data[3].status === "fulfilled") parking = data[3].value;
  initMap();
  render();
  fitMap();
  await Promise.allSettled([loadProviders(), refreshPublicSources()]);
  fitMap();
  updateProfileStats();
  return {
    getState: () => structuredClone(state),
    getVisible: () => structuredClone(visible),
    getCatalog: () => structuredClone(catalog),
    setOrigin,
    render,
    refreshPublicSources,
    refreshProvider,
  };
}
if (typeof document !== "undefined")
  initApp().catch(() => {
    const status = document.getElementById("resultDescription");
    if (status)
      status.textContent =
        "Place records could not load. Refresh the page to retry.";
  });
