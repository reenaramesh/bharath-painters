# Bharath Apps Messenger upgrade design

**Status:** Design draft for user review
**Route:** `/messages`
**Scope:** Existing React/Vite Messenger, existing Django chat APIs and PostgreSQL records, plus incremental real-time delivery.

## Goals and guardrails

Upgrade the existing Messenger into a responsive business communication tool while preserving the current route, REST contracts, stored conversations and messages, authentication, role rules, attachment security, safety reporting, and connected-contact workflows. Keep PostgreSQL as the source of truth. Make additional chat features additive and migrate existing conversations without deleting or rewriting their history.

Implement the work in reviewable phases. Phase 1 improves the current Messenger UI and existing REST-backed workflows. Phase 2 adds live updates through an optional WebSocket transport while keeping REST history and message submission available. Later phases add features that need new persistence or authorization semantics.

Do not deploy, change production services, or move existing message data as part of the initial implementation. Redis and ASGI deployment changes require a separate deployment-ready change after local implementation and verification.

## Current behavior to preserve

- `/messages` renders the existing `Chat` page for contractor, customer, and painter roles.
- `ChatConversation` and `ChatMessage` are the current PostgreSQL records. `ChatAttachment` metadata refers to files stored through Django storage.
- Existing REST endpoints list/create conversations, load/send messages, download attachments, edit/delete messages, forward messages, and report/block/unblock conversations.
- Existing features include text and reply/forward flows, paint colour and comparison cards, photo/PDF/contact-card attachments, edit/delete within the server-enforced ten-minute window, safety reports and blocks, unread counts, last-activity presence, and browser push through Web Push/VAPID notifications.
- The backend limits conversations to connected customers and eligible contractor/painter pairs. The API remains the authorization boundary.
- The current frontend polls conversations every 30 seconds and message history every three seconds. Message GET marks incoming messages read. The APIs do not currently paginate messages or persist groups, reactions, archives, pins, mutes, typing state, or idempotency keys.

## User experience

### Desktop

Keep the conversation list and active thread as the primary workspace. Add conversation search and supported filters. Provide a conversation details panel for participant identity, shared work context, safety actions, and preferences. At constrained desktop widths, the details panel may collapse behind a clearly labelled control.

The conversation list supports All and Unread using existing fields. Groups and Archived become active filters only when their backing data and permissions ship; before then, they must not display fabricated categories or counts. Conversation rows retain unread count, last message, timestamp, and presence. Search should call the existing conversation `search` parameter instead of downloading the full contact list.

Message bubbles keep the current reply, forward, edit, delete, attachment, colour, and safety presentation. Add clear sent/read state where the backend can authoritatively provide it. Add message search and pagination through additive API parameters, loading older messages without replacing the current history or changing existing default responses.

### Mobile

At 360, 390, and 430 CSS pixels, the conversation list and thread are separate full-screen states. Opening a conversation shows a back action to the list. The composer stays available above the keyboard and safe-area inset. All existing message actions remain reachable through labelled controls or a compact action sheet; attachment previews fit the viewport and can be opened/downloaded without clipping.

The mobile layout must preserve keyboard focus, scroll position when older messages load, and bottom position for new incoming messages only when the user was already near the latest message. Use accessible names, visible focus, and touch targets of at least 44 CSS pixels.

### Loading, empty, offline, and error behavior

Keep the last successfully loaded conversations and messages visible during refresh. Show first-load skeletons, clear empty states, connection status, retry controls, and a visible failed-send state. Do not silently discard a draft or attachment. While realtime is reconnecting, REST refresh remains available and incoming changes synchronize after reconnect. A message send is not automatically retried unless an idempotency key makes that retry safe.

## Realtime architecture

Retain REST as the compatible history, create, edit, delete, attachment, and safety interface. Introduce Django Channels as an additional event transport only after the local UI work is stable:

1. Authenticate a WebSocket using the existing session/JWT mechanism over WSS and resolve the same participant/connection authorization used by REST.
2. Use Redis as a Channels layer for conversation and user-presence groups. Do not treat a client-supplied conversation ID as authorization.
3. Publish `message.created`, `message.updated`, `message.deleted`, `message.read`, `presence.changed`, and typing events only after permission checks and successful database commits.
4. Continue storing messages and attachments in the existing PostgreSQL and Django storage models. WebSocket events carry IDs and minimal display-safe data; clients fetch canonical details through REST when needed.
5. The client de-duplicates events by persisted message ID, reconnects with backoff, and requests changes after its latest known cursor. REST remains available when a socket or Redis is unavailable.
6. Use existing Web Push/VAPID notifications for browsers. Consider FCM only if a separately scoped native push requirement is approved.

This requires adding Channels and Redis configuration, a routed ASGI application, an ASGI production process, and a provisioned Redis service. The repository currently has none of those pieces. Do not switch the production service until its hosting, Redis availability, WebSocket support, secrets, and rollback path are confirmed.

## Feature and data phases

### Phase 1 — Responsive UI and current APIs

Improve `/messages` without changing the message tables or removing API behavior. Add desktop conversation search and All/Unread filters, responsive detail context, full mobile conversation navigation, message pagination/search where a backward-compatible REST extension is available, clearer connection/error states, and accessible message/attachment actions. Preserve current safety prompts, report/block controls, and role-aware contact creation.

### Phase 2 — Live events and reliable delivery

Add Channels/Redis transport behind the existing REST workflows. Implement presence heartbeats and typing indicators with expiry. Treat REST message creation as canonical, use persisted IDs to de-duplicate, and add a client-generated idempotency key before enabling safe automatic retries. Surface sent, delivered, and read states only when the server has recorded the corresponding acknowledgement. Keep push notifications on the existing Web Push path.

### Phase 3 — Per-user conversation controls and richer messages

Add per-user conversation preferences for pin, mute, and archive. Add emoji reactions with a separate reaction record and permission checks. Add voice attachments only after server-side MIME/content validation, size/duration limits, safe storage, and accessible playback are defined. Do not represent audio as a generic file upload.

### Phase 4 — Groups and business record cards

Add explicit conversation membership and per-member receipts before group messaging. Keep existing one-to-one conversation foreign keys and records intact; map existing records to initial members through a reversible migration. Define who may add/remove members and who can see shared content. Structured cards must contain only a resource type and ID plus safe display fields. Each card is fetched through its existing permission-checked endpoint; hide unavailable or financially restricted fields for any participant who lacks access. Initial eligible card types: customer, property, quotation/revision, measurement, work order/job, painter assignment, work schedule, service request, invoice/payment summary. Never place private customer notes, banking/KYC, or unrestricted financial data in a group event.

## Compatibility and migration

- Do not replace `/api/quotations/chat/conversations/` or `/api/quotations/chat/conversations/:id/messages/`.
- Existing REST clients continue to work while the new client negotiates WebSocket capability.
- New response fields are additive. New query parameters are optional, and the current unpaginated response shape remains supported until all consumers migrate.
- New message features use additive models or nullable fields with safe defaults. Existing one-to-one conversation and message IDs remain stable.
- Additive schema migrations must be reversible where practical and must never delete chat rows or uploaded files.

## Verification plan

- Exercise contractor/customer/painter access and denied cross-conversation access; verify admin and support roles retain their current separate behavior.
- Verify existing history, unread behavior, attachments, edit/delete time limits, forwarding, safety reports, and notification creation still work.
- Verify ordering, cursor pagination, read acknowledgement, duplicate-send prevention, reconnect synchronization, and offline draft retention.
- Verify attachment extension/content validation, upload limits, private download authorization, and group resource-card permission filtering.
- Verify desktop at 1440 pixels and mobile at 360, 390, and 430 CSS pixels, including keyboard open, large text, safe areas, empty/loading/error/offline states, and screen-reader names.
- Run focused backend and frontend checks. Treat a missing Redis or native push environment as pending infrastructure verification, not a passing result.

## Open deployment boundary

The design uses Channels and Redis only for the realtime phase. Before production realtime rollout, confirm the current Render service can run ASGI/WebSockets and has a Redis service, then document environment variables, service commands, health checks, and rollback to REST polling. Until then the upgraded UI and REST behavior continue to work without realtime infrastructure.
