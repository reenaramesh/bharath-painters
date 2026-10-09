# Contractor network list and profile popup

Connected is now labelled Contractors. Connected contractors appear as compact list rows with a View profile action. The native profile dialog shows work/services, work areas, office/base location, contact and a link to the full profile. Send work, Disconnect and Block remain available inside that dialog; they are absent from list rows.

Requests contains separate Requests received and Requests sent sections. Both support View profile. Received requests offer Accept and Reject; Reject opens the existing reason and confirmation flow. Sent requests show waiting for acceptance without unauthorized Accept/Reject actions. Existing history and repeated-request actions remain available through profile details.

Validation: production build, targeted lint and whitespace checks. Native Python Playwright checked 360, 390, 430 and 1440px layouts, dialog opening/Escape closing, profile work details, sent/received sections, action placement and mocked rejection with the correct reason. A mocked acceptance also verified removal from received requests. Browser writes were intercepted and no real connections or database records changed. No uncaught browser errors were recorded. Desktop and mobile screenshots were visually reviewed. No authentication secrets are saved in artifacts.

Existing connection permissions, search filters, API request payloads and backend behavior are retained. Missing directory fields are shown as not provided.
