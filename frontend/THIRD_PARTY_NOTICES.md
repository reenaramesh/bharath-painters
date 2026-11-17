# Premium UI dependency notices

The premium UI uses **Motion 14.7.1**, through the `motion/mini` entry point. Its React peer range includes this application's React 19. Only the small native browser animation API is imported by application code; no reference dashboard template, full Motion React feature bundle, or new component framework is imported.

Motion, motion-dom and motion-utils are MIT licensed, copyright Motion B.V. Complete copyright/permission notices are retained in the installed packages and included in production assets at:

- `public/third-party/motion-license.txt`
- `public/third-party/motion-dom-license.txt`
- `public/third-party/motion-utils-license.txt`

The four requested reference repositories were studied in the original pilot. Their MIT licences require retaining notices if substantial source is copied. The rollout uses original local components and existing project components/assets, and copies no source or demo data from those repositories. Design references and compatibility notes are recorded in `docs/contractor-saas-pilot-2026-10-28.md`.

Motion API and compatibility references: https://motion.dev/docs/animate and https://motion.dev/docs/react-installation.
