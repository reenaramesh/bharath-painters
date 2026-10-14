# Call Inbox Android companion boundary

The web CRM and manual call-entry workflow do not depend on Android. The Android client is an optional, separate integration target: `mobile/` currently contains an Expo-managed app but no checked-in `android/` native project or call-screening bridge.

## Supported capture contract

An Android implementation can submit an authenticated `POST /api/call-inbox/events/` with:

```json
{
  "phone_number": "+919876543210",
  "caller_name": "Optional contact name",
  "name_source": "PHONE_CONTACTS",
  "occurred_at": "2026-10-14T10:15:00Z",
  "call_status": "",
  "capture_source": "ANDROID",
  "idempotency_key": "installation-uuid:call-creation-time:normalized-number"
}
```

The backend accepts the same contract for manual and Android events, applies contractor ownership from the signed-in account, normalizes the number, matches only customers visible to that contractor, and safely returns the existing event for a repeated contractor/idempotency key.

## Android role and permission constraints

Automatic capture would need an Android-native `CallScreeningService` and the user to grant the app `ROLE_CALL_SCREENING`. Android invokes only the user-selected screening app, so enabling Bharath Apps can replace Truecaller as the selected call-screening app. The service must allow/reject every incoming call within five seconds; it must not delay ringing while it contacts the backend. Android also withholds contact calls from the service unless the user grants `READ_CONTACTS`.

The screening callback provides the phone handle and creation/connect times, not a reliable final answered/missed/rejected outcome. Store call status as unavailable unless another explicitly permitted Android API supplies a reliable value. Contact names can only come from the device contacts with user permission. The web app must not claim a Truecaller name or use scraping, notifications, or private APIs.

Google Play restricts Call Log permissions to apps registered as the default Phone or Assistant handler. This companion must not request `READ_CALL_LOG`, `WRITE_CALL_LOG`, accessibility access, or notification access for call capture. See [Android CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService) and [Google Play sensitive permissions policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en).

## Required native follow-up before shipping

1. Add a separately buildable Android native companion/service and explicit onboarding explaining the screening-role tradeoff and contact permission.
2. Have the service immediately allow calls, place only a minimal number/time/idempotency record in private local storage, and never call the network from the screening callback.
3. Bridge pending records to the authenticated Expo app; sync over TLS using the existing session, retry with the idempotency key, and delete local records only after server acknowledgement.
4. Verify role acquisition, behavior with Truecaller and system dialers, contact-permission denial, offline recovery, and Android/Play release policy on physical devices before enabling the feature.

No Android permission or service is added by this web implementation. Until that native work is built and device-tested, the inbox remains fully functional through manual call entry.
