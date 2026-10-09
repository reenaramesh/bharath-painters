# Supplied Contractor Profile integration

Visual source: the user's two supplied attachments, integrated as `frontend/src/components/ContractorProfileView.jsx` and `ContractorProfileView.css`. CSS is copied unchanged, including the 360/390/430 breakpoint rules. JSX section order, cards, classes and structure are preserved. The only presentation-code adaptations hide unavailable actions and label the existing request action Assign Work in an authorized partner context.

## Route and presentation

Reused `/profile` for the signed-in contractor and `/profile?contractor=<Bharath ID>` for other contractors. No new competing route was created. Internal partner pages/popups and Find contractor use the same supplied component through a data/action adapter.

The old presentation in ContractorProfileView was replaced. ContractorDigitalCard now forwards its authenticated data to the adapter. ContractorPublicProfilePage, ContractorNetworkProfile, ContractorNetwork and ProfileCard were rewired to the adapter. ContractorPortfolio and contractor-portfolio.css remain on disk to preserve existing workspace changes but are no longer imported by the profile flows. Old profile HTML is not combined with the supplied view.

## Existing APIs and action wiring

- `/accounts/profile-card/`: own authenticated digital-card data.
- `/accounts/contractors/`: directory and public contact/basic details.
- `/accounts/verify-page/<Bharath ID>/`: existing public presentation data, parsed inertly.
- `/quotations/service-requests/options/`: customer permissions and contractor connection.
- `/quotations/chat/conversations/`: existing connected-customer Message action; opens `/messages?conversation=<id>`.
- `/quotations/contractor-connections/`: existing partner permissions and connection management.
- Request Quote opens the existing preselected service-request form. Assign Work opens the existing contractor-prefilled subcontract work-order form only when `can_send_work_order` allows it.
- Back uses existing navigation or closes/returns within the partner popup. Share uses the public verification URL with native share or clipboard. Edit Profile opens `/settings`.

Contractor-to-contractor native chat is not supported by the current conversation API. Its Message button is hidden rather than sending an unsupported request or replacing it with a different messaging product. Customer Message and Request Quote are hidden when no authorized customer connection exists.

## Data whitelist

Mapped company/business name, contractor name, logo/profile image, saved background or recent project image, core service, verified status, experience, public location, About, services and sub-services, workforce, completed-project count, coverage chips, project images, aggregate rating and public review content. Existing sub-services are provided in the same services list by the public API. Contractor name is available in the mapped object; the supplied layout has no separate contractor-name slot.

The adapter creates a new explicit presentation object. Bank fields, KYC/document fields, private customer addresses/contact details, emergency contacts and internal notes are not forwarded.

Unavailable: availability, published service prices/offer prices/units, and separate identity/business verification flags. These are not fabricated. Only the actual Bharath verified flag is shown. Missing About/services/projects/reviews follow the supplied component's conditional/empty rendering.

## Validation scope

Only `npm run build` and `git diff --check` are run. No full QA, browser tests, backend tests, backend edits, commit or push. Static inspection confirms the supplied CSS retains two columns plus a full-width request action below 380px, and three action columns at 390px and 430px when all actions are available. Visual/browser verification is not claimed.

Results: frontend production build PASS (11.96 seconds); `git diff --check` PASS (existing Windows line-ending notices only).
