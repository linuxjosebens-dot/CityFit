# Dataset audit — October 10, 2026

The app uses source records, not generated parking prices or sales forecasts.
A newly retrieved record is not proof its underlying survey or map edit is recent.

| Dataset | Source and verification | Limits |
| --- | --- | --- |
| 46 parking lots | OpenStreetMap `/api/0.6/ways.json` and referenced nodes retrieved again; geometry, tags, modification timestamps and versions replaced | Selected-site coverage; community tags do not verify current fees, truck fit or vending permission. 41 pass filters. |
| 94 venue references | All 63 City park records from Parks/MapServer/4 refreshed; 31 OSM venue records and their geometry refreshed | Venue centroids are references, not truck bays. Nearby venue association is geographic inference. |
| Irvine boundary | City ADT/MapServer/0 geometry retrieved again | Official published GIS boundary |
| 345 road records | City ADT/MapServer/1 queried again without transfer-limit truncation | 2022 remains the newest published measurement year. Original 2012–2019, 2021 and 2022 columns retained, including missing values. Ranking uses positive 2022 counts only. These are vehicle counts, not customers. |
| Event history | City 2020 announcement, 2024 bulletin, Summer 2025 guide and June 6, 2026 concert page checked | Announcement date separated from event date. Only 2020 Lot 2 evidence specifies the truck lot; other records identify venues or visitor parking. Published announcements do not prove actual attendance or sales. |
| UCI fees | Live HTTPS operator page retrieved: https://parking.uci.edu/permits/rates/ lists 2026–2027 rates | General $16/day, reserved $20/day, service $22/day. Campus guidance applies only to eligible permits/stalls; no truck-specific quote inferred. Search cache still returned 2025–2026, so live retrieval was used. |
| Spectrum fees | https://www.irvinespectrumcenter.com/guest-services/parking-transportation | Complimentary standard visitor parking; premium lot $5 Mon–Thu, $20 Fri–Sun. Unmatched mapped lots are not automatically marked free. Truck quote unverified. |
| Great Park fees | June 23, 2026 staff report: https://irvine.granicus.com/MetaViewer.php?event_id=2855&meta_id=187412&view_id= | Proposal includes varying paid rates. Current implementation/lot charge not established by this document; shown as unconfirmed, overriding confidence in old free tags. |
| Guidance/context links | OC mobile food guidance, public records index, Irvine licensing, UCI event terms and Census QuickFacts checked | Regulatory guidance links are not operator approvals. Census figures remain citywide context. |
| Fuel and routing | Existing HERE, OSRM, OSM integrations retained | Live fuel still requires HERE credentials. No live fuel retrieval verified; editable fallback remains labeled as an assumption. OSRM is not a truck-restriction routing service. |

Parking fees entered by the operator are separate from booking fees and are
included in surplus and break-even calculations. Published visitor guidance is
not automatically charged to a truck. Unknown fees do not establish free parking.
The fee input starts at $0 as an editable budget assumption and accepts cents.

No internet dataset establishes universal accuracy, current truck parking
availability or permission. Cards disclose source, retrieval/check date, scope
and unverified fees instead of presenting missing facts as confirmed.

## Automatic parking estimates

The planner now calls a local API that attempts to refresh the selected lot's
OSM tags and calculates an estimate from usable USD charge tags or fee=no.
Community map estimates remain unverified, even when fetched live. UCI's $16
general visitor rate is an estimate, not a confirmed truck fee. Great Park's
proposal and Spectrum's unmatched rate zones do not produce numeric quotes.
Unknown results use a clearly labeled $0 budget placeholder. Manual quotes
are stored per lot and service window and can be reset to automatic mode.
