# Find contractor and preview profile

Contractor Network now uses Find contractor for the entry action, search window title and search button. Search results offer View profile. Selecting a contractor reveals their services/work skills, service areas, office/base location, experience and team size, using the existing verified contractor directory response. The full public profile link opens in a new tab so the search and request message remain available.

Existing search, distance/location filters and connection request payload/permissions remain unchanged. No backend or database changes were needed. Missing profile fields are explicitly described as not provided.

Native Python Playwright verified preview details, the public profile URL, request readiness, and no page/dialog overflow at 360, 390, 430 and 1440px. Synthetic directory data was used. No POST/PATCH/DELETE requests occurred during profile review, and no uncaught browser errors were recorded. Build, targeted lint and whitespace checks passed. Screenshots were visually inspected on desktop and mobile. No credentials or authentication state are stored in these files.
