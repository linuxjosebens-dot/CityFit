# CityFit release preparation

CityFit includes a compact planner, styled PDF export, unique parking-lot
names, grouped location dropdowns and a searchable plain-language permit
checklist. Existing browser data is preserved through the TruckFit migration.

Planner estimates include food, payment processing and entered fuel costs.
Booking, parking, labor and other overhead are excluded. Station lookups
are removed. Current Location requests browser permission for device location
and shows reported accuracy. Address entry remains available when permission
is denied or device location cannot be determined.

Validation includes unit tests, public-server checks, PDF integrity checks,
formatting, and browser workflows at desktop and mobile widths. External
services are mocked in browser checks, so their availability and real location
accuracy require live verification. Saved lot coverage is partial and lot
permission is not verified. Production hosting has not been deployed.

Release validation completed: 19 tests passed; formatting passed; browser
workflows passed at 1440, 390 and 320 px, including permit search, unique
lot labels, planner inputs, location lookup and PDF download.
