// Published event evidence is scoped to the lot or venue named by the source.
// It is not a current booking, vending approval or observed sales record.
export const PARKING_HISTORY = [
  {
    venueName: "Mike Ward Community Park",
    date: "2026-06-06",
    title: "Summer in the City: Jimmy Buffett Tribute",
    detail:
      "The City advertised local food trucks at the Mike Ward Community Park concert. The exact parking lot and vendor bay were not named.",
    url: "https://cityofirvine.gov/news-media/calendar-of-events/event/summer-city-summer-concert-jimmy-buffet",
    scope: "venue",
    checkedAt: "2026-10-10",
  },
  {
    lotId: "parking-way-227720878",
    date: "August 2020",
    publishedAt: "2020-06-15",
    title: "Great Park Drive-In Series",
    detail:
      "The City announced food trucks at its 2020 drive-in events in Parking Lot 2.",
    url: "https://cityofirvine.gov/node/64561",
    scope: "lot",
  },
  {
    lotId: "parking-way-227720878",
    date: "2024-08-06",
    publishedAt: "2024-08-01",
    title: "National Night Out at Palm Court",
    detail:
      "The City announced food trucks at Palm Court and visitor parking in Lot 2. The vendor bay was not specified.",
    url: "https://content.govdelivery.com/accounts/CAIRVINE/bulletins/3abd391",
    scope: "nearby event",
  },
  {
    venueName: "Mike Ward Community Park",
    date: "2025-07-19",
    title: "Summer Concert: Family Style",
    detail:
      "The City’s Summer 2025 guide listed food trucks at the July 19 Family Style concert at Mike Ward Community Park. The parking lot or vendor bay was not specified.",
    url: "https://online.flippingbook.com/view/802429622/1/",
    scope: "venue",
  },
  {
    venueName: "Hicks Canyon Community Park",
    date: "2025-06-13",
    title: "Movies on the Lawn: Harold & the Purple Crayon",
    detail:
      "The City’s Summer 2025 guide listed food trucks at the June 13 movie at Hicks Canyon Community Park. The parking lot or vendor bay was not specified.",
    url: "https://online.flippingbook.com/view/802429622/1/",
    scope: "venue",
  },
];
