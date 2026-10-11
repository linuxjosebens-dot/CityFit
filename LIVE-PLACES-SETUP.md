# Live Google and Apple place search

The integration is implemented, but live access requires provider credentials and an HTTPS Node API host. The Firebase web key in `auth-config.js` is for Authentication; it does not enable Places API access. GitHub Pages cannot run `server.mjs`.

## Google setup

1. In Google Cloud Console, use your existing project or create one. Enable billing and **Places API (New)**.
2. Create a separate server API key. Restrict it to Places API (New), and restrict server IP addresses if your host has fixed outbound IPs. Set quota limits and billing alerts. The requested rating/review-count/opening-status fields can affect billing.
3. Set the host's secret environment variable `GOOGLE_MAPS_API_KEY`. Never put this key in `auth-config.js`, `provider-config.js`, GitHub source, or chat.

## Apple setup (optional)

1. Obtain Apple Developer Maps access, a Maps identifier and a private key.
2. Generate a signed Maps Server API authentication JWT using Apple's documentation. Set it as the secret environment variable `APPLE_MAPS_AUTH_TOKEN` on the server.
3. Renew the authentication JWT before it expires. CityFit exchanges it for a short-lived access token on each search. Neither token is sent to the browser.
4. Until this credential exists, Apple live search stays disabled. Public Apple Maps links still work.

## Host the API and connect GitHub Pages

Deploy the repository to a Node 20+ host with `npm start` as its start command. Configure:

- `HOST=0.0.0.0` and the host-provided `PORT`.
- `GOOGLE_MAPS_API_KEY` and optionally `APPLE_MAPS_AUTH_TOKEN` as secrets.
- `CITYFIT_ALLOWED_ORIGIN=https://linuxjosebens-dot.github.io` (an origin has no `/CityFit/` path).

Set the public `providerApiBase` in `provider-config.js` to the HTTPS API server origin, for example `https://your-api.example.com`. Commit and push that public address to GitHub Pages. Leave it blank for same-origin local/server hosting.

Check `https://YOUR-API/api/location/status`: configured providers should report `true`. In the website, choose a starting point, select Google or Apple as the place provider, and reload records. The server calls `/api/location/places?provider=google&lat=33.6859574&lon=-117.8261275&radius=15` to search live parking places. Google returns up to 20 matches per request; extra pages are marked as partial rather than fetched automatically. The website still filters to Irvine and shows up to ten ranked results.

## What this integration provides

- Google: names, addresses, coordinates, ratings, review counts, reported opening status and provider attribution.
- Apple: names, addresses and coordinates; unavailable ratings/opening status remain unknown.
- Current queries, not stored snapshots. Provider content is returned with `Cache-Control: no-store` and kept in memory for the current view.
- Provider map links instead of drawing proprietary results on the OpenStreetMap view.
- Input validation, 12-second provider request deadlines, sanitized provider errors and an in-memory limit of 30 searches/minute per server connection IP. Behind a proxy this limit may be shared; configure host-level quotas/rate limits before broader use.

These are place search results, not verified surface lots or vending permissions. No live crowd counts, route durations or traffic-aware ETAs are included in this change. Existing historical road/pedestrian evidence remains separate. API credentials being configured does not prove billing/token validity; a failed provider request shows an unavailable message.

## Provider documentation

- [Google Places Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Google Places display policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Apple Maps Server API](https://developer.apple.com/documentation/applemapsserverapi)
- [Apple Maps token generation](https://developer.apple.com/documentation/applemapsserverapi/creating-and-using-tokens-with-maps-server-api)
