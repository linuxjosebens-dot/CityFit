export const SOURCES = [
  {
    title: "Address Search & Distance References",
    tag: "Live Address Lookup + Map Coordinates",
    type: "blue",
    desc: "Photon suggests addresses using OpenStreetMap data. Nearby filtering uses approximate mapped reference points and straight-line distance. Choose the intended match before applying a radius.",
    url: "https://photon.komoot.io/",
    date: "Area reference coordinates checked October 10, 2026 · © OpenStreetMap contributors",
  },
  {
    title: "Orange County Mobile Food Permits",
    tag: "Official Guidance",
    type: "",
    desc: "Health permits, plan review, commissary documents, route-stop forms and restroom requirements for trucks and carts.",
    url: "https://ochealthinfo.com/services-programs/environmental-health/food-safety-programs/mobile-food-trucks-and-carts",
    date: "Agency guidance checked October 10, 2026",
  },
  {
    title: "Irvine Business Licensing",
    tag: "Official Guidance + Directory",
    type: "",
    desc: "Application steps, zoning contacts and links to licensed-business search. Listings do not verify where a truck currently serves.",
    url: "https://cityofirvine.gov/community-development/business-licensing",
    date: "City page checked October 10, 2026",
  },
  {
    title: "Mobile Food Establishment Records",
    tag: "Public Report",
    type: "",
    desc: "OC Environmental Health links to a Mobile Food Establishments report. County coverage must be filtered and checked for Irvine relevance.",
    url: "https://www.ochealthinfo.com/services-programs/environmental-health/request-records",
    date: "Records index checked October 10, 2026",
  },
  {
    title: "Irvine Road Traffic Counts",
    tag: "Historical Proxy",
    type: "blue",
    desc: "The Shift planner ranks real 2022 average daily vehicle counts from the City’s ADT layer within your address radius. Coverage is partial. Vehicle counts do not predict lunch customers.",
    url: "https://gis.cityofirvine.org/arcgis/rest/services/ADT/MapServer",
    date: "2022 newest listed layer · checked October 10, 2026",
  },
  {
    title: "Great Park Event Calendar",
    tag: "Official Schedule",
    type: "",
    desc: "Published event dates and organizer links help find leads. Attendance, vendor fees and available slots need confirmation from organizers.",
    url: "https://www.cityofirvine.gov/great-park/great-park-events",
    date: "Schedule checked October 10, 2026",
  },
  {
    title: "Irvine City Context",
    tag: "Census Citywide Statistics",
    type: "",
    desc: "Population estimate: 318,764 in July 2025. Median household income: $136,719 for 2020–2024, in 2024 dollars. These are citywide context, not location demand.",
    url: "https://www.census.gov/quickfacts/irvinecitycalifornia",
    date: "2025 population / 2020–2024 income · checked October 10, 2026",
  },
  {
    title: "UC Irvine Vendor Approvals",
    tag: "Campus-Specific Guidance",
    type: "blue",
    desc: "UCI event terms require advance written approval for food trucks. Research campus service through the event host and university process.",
    url: "https://studentcenter.uci.edu/events/plan-an-event/registered-campus-organizations/event-terms/",
    date: "Campus terms checked October 10, 2026",
  },
  {
    title: "Customer Taste & Sales",
    tag: "Collect From Your Business",
    type: "amber",
    desc: "Record actual orders, service hours and direct customer requests. Your own repeated shifts provide evidence about customer demand.",
    url: null,
    date: "Operator shift log available in the Shift planner",
  },
];
export const PERMITS = [
  [
    "health",
    "Get your truck’s health permit",
    "Ask Orange County about a mobile food health permit, truck inspection and any plan review you need.",
    "https://ochealthinfo.com/services-programs/environmental-health/food-safety-programs/mobile-food-trucks-and-carts",
  ],
  [
    "license",
    "Check your business license",
    "Ask Irvine about your business license and whether you can sell food at your chosen spot.",
    "https://cityofirvine.gov/community-development/business-licensing",
  ],
  [
    "seller",
    "Check your seller’s permit",
    "Ask California’s tax agency (CDTFA) whether you need a seller’s permit.",
    "https://www.cdtfa.ca.gov/taxes-and-fees/faqseller.htm",
  ],
  [
    "commissary",
    "Prepare your kitchen and stop records",
    "Ask Orange County about a commissary agreement (your approved kitchen or truck service base) and records of where you will stop.",
    "https://ochealthinfo.com/services-programs/environmental-health/food-safety-programs/mobile-food-trucks-and-carts",
  ],
  [
    "restroom",
    "Arrange a restroom and handwashing",
    "Check that an approved restroom and handwashing area are available for your stop. Ask about the rule for stays over one hour.",
    "https://ochealthinfo.com/services-programs/environmental-health/food-safety-programs/mobile-food-trucks-and-carts",
  ],
  [
    "host",
    "Get permission to use the spot",
    "Get the owner’s or organizer’s permission. Ask if your event, truck or equipment needs any other approval.",
    "https://cityofirvine.gov/facility-reservations/special-event-permit-application",
  ],
];
export const LEGACY_AREAS = [
  {
    id: "uci",
    name: "UC Irvine campus",
  },
  {
    id: "utc",
    name: "University Town Center",
  },
  {
    id: "research",
    name: "University Research Park",
  },
  {
    id: "ibc",
    name: "Irvine Business Complex",
  },
  {
    id: "spectrumoffices",
    name: "Spectrum business district",
  },
  {
    id: "spectrum",
    name: "Irvine Spectrum Center",
  },
  {
    id: "sports",
    name: "Great Park sports area",
  },
  {
    id: "live",
    name: "Great Park Live",
  },
  {
    id: "woodbridge",
    name: "Woodbridge",
  },
  {
    id: "portola",
    name: "Portola Springs",
  },
];
