# Bharath Apps mobile

Independent Android-first Expo SDK 55 / React Native / TypeScript / Expo Router app with React Native Paper Material Design 3. Existing backend, PostgreSQL, web and deployment are untouched.

## Run

Node 22.13+ (Node 24 recommended). From this directory:

```powershell
npm ci
Copy-Item .env.example .env
# Set EXPO_PUBLIC_API_URL to your existing reachable API, including /api.
npm start
# Press a for an Android emulator, or scan the QR code with a compatible Expo Go.
```

Use a compatible SDK 55 Expo Go or a development build. On a physical phone, localhost refers to the phone; use a reachable development LAN address. Android emulator host loopback is 10.0.2.2. HTTPS is required for non-local endpoints. No production URL is configured by default.

`Explore demo workspace` opens the full navigation prototype without any API calls. All ten Contractor modules have searchable sample lists/detail flows; settings includes System/Light/Dark selection. Demo never sends account or business writes. With real sign-in, only Home is connected to business data; other modules clearly describe pending integration. Other roles authenticate into a dedicated holding screen rather than contractor content.

Native sessions use Expo SecureStore. Web preview keeps tokens in memory and signs out on reload. Logout clears this device's session; the existing API has no logout/revocation contract wired here. Theme overrides apply to the current session. No quotation/payment/measurement calculation or write logic is reimplemented yet.

```powershell
npm test
npm run typecheck
npm run export:android
npm run web
```

See [audit, screen inventory and implementation sequence](docs/AUDIT.md) and [complete source route declarations](docs/route-inventory.md). Browser layout QA is supplementary: native Android back, TalkBack, keyboard resize, status/navigation bars and performance must also be verified on device before release.

See [verification results and remaining release checks](docs/VERIFICATION.md), including upstream dependency advisories.
