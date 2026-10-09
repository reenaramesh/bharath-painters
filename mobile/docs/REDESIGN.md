# Contractor mobile visual redesign

Selected direction: navy, ivory and orange, explicitly selected by the user. This revises the mobile presentation only.

The original home used a large greeting, a pale quotation card, two large metric cards and another grid of metric destinations. Equal surface weight and repeated destinations made it resemble the existing web dashboard. The new hierarchy groups business numbers inside a navy briefing, elevates follow-ups immediately below it and gives four everyday shortcuts a compact native row. White record surfaces and ivory negative space distinguish secondary content from the business briefing.

Design tokens: 4/8/12/16/24/32dp spacing; 20dp card radius; at least 48dp controls; navy #14243A; ivory #F8F6F2; burnt orange primary #AA3E19; white surfaces; Manrope regular/semibold/bold. Dark theme uses blue-black surfaces with peach accents and light text. Typography is bundled locally; no remote font fetch is needed at runtime.

Login has a branded navy panel; bottom navigation has an active pill; module and record screens share the updated tokens. Desktop browser preview is centred in a frame capped at 430px, while native layout is unaffected. The demo indicator remains visible but becomes quiet metadata. No fake growth charts, invented revenue, financial mutations or API contract changes are introduced. Quotation value retains its existing meaning as estimate value.

Validation: existing behavior tests, strict TypeScript, Android export and Python Playwright at 320/360/390/430px, including demo navigation and simulated API contracts. Native device checks remain required before release.
