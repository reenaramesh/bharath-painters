# Contractor network profile review

Verified at 1440, 360, 390 and 430 CSS pixels using synthetic contractor and work-order responses.

- View profile replaces search results with the contractor profile in the same native dialog.
- Profile contains work, service areas, office/base, experience/team and Call/WhatsApp links.
- Send request and Cancel remain together in the footer; mobile action text fits on one line.
- Connected list has no repeated Connected labels; project counts represent work orders together with the signed-in user.
- Completed and active counts exclude cancelled work; unavailable/incomplete project data displays a dash.
- Received requests retain Accept/Reject, sent requests retain waiting state, and Disconnect/Block remain inside the profile.
- Escape closes the profile; Back to contractors returns to the search results.
- Simulated send failure preserves the message; retry submits the original recipient and discovery method.
- No horizontal overflow at the tested widths and no uncaught browser errors.

All connection mutations were intercepted. No real requests, financial changes or database writes occurred. Screenshots contain sample contractor details. Authentication values are not stored in this report.
