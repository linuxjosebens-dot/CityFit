CityFit Irvine

Run locally
Requires Node.js 20 or later. No runtime dependencies.
Run npm start, then open http://localhost:8080.
Use PORT=8087 npm start if port 8080 is occupied.
Serve the app through a web server; do not open index.html directly.

Intro and accounts
The server opens the introduction page at /. The planner is /index.html.
See AUTH-SETUP.md to enable email accounts and Google sign-in. Authentication
is prepared but disabled until Firebase is configured. Google controls its
own two-step verification. Guest access remains available.

What the app does
- Finds mapped surface parking lots within Irvine and your search radius.
- Groups lot choices by venue and gives repeated lot names stable numbers.
- Estimates orders from matching shift logs or your entered forecast.
- Calculates food, payment-processing and fuel costs from your inputs.
- Downloads a styled PDF plan with clickable route links.
- Tracks completed shifts and exports a CSV log.
- Provides a plain-language permit checklist and searchable per-lot guidance.

Location and data
Current Location requests browser permission to use your device location.
Allow location services on HTTPS (or localhost); accuracy is shown when available.
If permission is denied or location is unavailable, enter a starting address.
Address suggestions use Photon/OpenStreetMap. OSRM estimates road distance.
If routing fails, travel is labeled as straight-line distance x 1.3 each way.
Fuel prices are entered manually. No station lookups or booking/parking fees
are included in planner estimates. Labor and other overhead are excluded.

The saved parking dataset covers selected Irvine sites, not every lot.
Ranking uses exact-lot shift evidence, published events, historical road
counts and distance. Past events do not establish current vendor permission.
Reloading saved records does not verify current parking availability.
Confirm truck access, host permission and applicable permits before service.
Per-lot permit guidance reflects mapped site categories and needs agency or
host confirmation. Connected Google/Apple accounts are not implemented in
the local server; provider map links work independently.

Saved data
Preferences, checklist progress and shift logs stay in browser storage.
Firebase sign-in shows your profile in the top-right panel and supports sign-out.
Planner records are not uploaded or separated by account. Cartoon avatar choices
are saved separately per account and guest in this browser, with keyboard
selection and an account-avatar reset. Guests can also switch themes.
No Firestore setup is needed.
Older TruckFit saved data is read for migration. Download PDF/CSV copies.
See privacy.html for data sharing details.

Development checks
npm ci
npx playwright install chromium
npm test
npm run format:check
npm start                         (in another terminal)
npm run test:browser
npm run test:theme                (checks light/dark text contrast)
Browser tests mock external services at 1440, 390 and 320 pixels.
Artifacts are saved under artifacts/ and excluded from source control.
Tests do not verify external-service uptime or real device location.

Key files
app.js                  Interface and workflows
shift-plan-pdf.js       Browser PDF generation; no external service
location-core.js        Addresses, distance, ranking and budget math
parking-core.js         Lot eligibility, geometry and distinct names
business-data.js        Permit guidance and agency links
server.mjs              Public asset allowlist and local data endpoints
index.html / styles.css Interface and responsive layout

Release
Serve on HTTPS through a production static host or configured reverse proxy.
Keep environment files and server credentials out of public assets.
Review saved data dates and current host/agency requirements before launch.
The local server also retains optional pricing endpoints for compatibility;
the current interface does not call them.
