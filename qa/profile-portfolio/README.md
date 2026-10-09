# Contractor profile redesign

The own profile, contractor profile route and Find contractor popup reuse one portfolio component.

Layout follows the supplied responsive mockup: a completed-work photo cover, overlapping owner photo, verified identity, compact actions, Overview/Services/Projects/Reviews section controls, About us, offered services, service locations, completed projects as thumbnail rows, and customer reviews.

View profile links to /profile?contractor=<Bharath ID> for the selected contractor; the normal /profile URL still displays the account owner. Profile actions preserve sharing, PDF preview/share, contact saving and settings navigation. Connections preserve send/retry, accept/reject and management actions.

Saved business About text, service categories and active sub-services are included in presentation data. Draft About/headline text is available only through the authenticated owner profile; public cards use published text. The shared verification HTML embeds only its existing public card payload as safely escaped JSON, allowing the frontend to display the same completed projects and reviews without accessing another user's private profile. No database schema or business workflow changes were made.

Browser verification: 1440, 768, 320, 360, 390 and 430 CSS pixels; desktop/mobile screenshots inspected. Checks cover correct contractor navigation, project and hero photo loading, project-row layout, section controls, empty profiles, minimum 44px export actions, no horizontal overflow, native dialog Escape, failed send preservation/retry, rejection and public profile load retry. All connection mutations were intercepted and no real connection request was sent. Browser reports contain no authentication values.

Backend verification: three SimpleTestCase tests verify public JSON escaping/private-field exclusion and published versus owner-only About data, service filtering and office details without database access. Production build, targeted lint and diff whitespace checks were run.

Live deployment must include both frontend changes and the public profile template/presentation fields. Existing PDF generation uses its existing template; this task changes the screen presentation.
