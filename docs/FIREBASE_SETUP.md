# Firebase Authentication setup

The frontend signs users in with Firebase Authentication and sends the Firebase ID token to the Go API,
which verifies it (see D-052 in [DECISIONS.md](DECISIONS.md) and §4 of [CONTRACTS.md](CONTRACTS.md)).

## 1. Local development (no Google account needed)

Uses the official Firebase Auth Emulator with the placeholder project `demo-credenviel`.

```bash
make up                       # local Postgres (apply db/migrations/*.up.sql first if the DB is new)
make firebase-emulator        # Auth Emulator on 127.0.0.1:9099
make run-api-firebase         # API with AUTH_MODE=firebase against the emulator
cd frontend && cp .env.example .env.development.local   # then fill in the values below
npm run dev
```

`frontend/.env.development.local` (git-ignored, only read by `npm run dev`):

```
VITE_API_BASE_URL=http://127.0.0.1:8080
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-credenviel.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-credenviel
VITE_FIREBASE_APP_ID=1:000000000000:web:demo
VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

Notes:
- The emulator issues **unsigned** tokens. The API only accepts them when `FIREBASE_AUTH_EMULATOR_HOST` is set
  **and** `APP_ENV=local`; with any other `APP_ENV` the API refuses to start.
- `make run-api-firebase` treats `examcell@university.edu` as an issuer once its email is verified. Verify it in the
  emulator by opening the link from `GET http://127.0.0.1:9099/emulator/v1/projects/demo-credenviel/oobCodes`.
- "Continue with Google" works in the emulator through its fake account chooser.

## 2. Real Firebase project (requires your Google account)

1. [Firebase console](https://console.firebase.google.com) → create/choose a project.
2. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
3. **Authentication → Settings → Authorized domains**: add your Static Web App host
   (e.g. `mango-ground-04b33f300.4.azurestaticapps.net`) and any custom domain. `localhost` is there by default.
4. **Project settings → Your apps → Web app**: register an app and copy the config values.
5. Frontend build environment (e.g. GitHub Actions / Static Web Apps build settings):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
   These are public client identifiers, not secrets. Do **not** set `VITE_FIREBASE_AUTH_EMULATOR_HOST`.
6. API deployment (Bicep parameters on `infra/main.bicep`):
   `authMode=firebase`, `firebaseProjectId=<project id>`, `firebaseIssuerEmails=<comma-separated emails>`.
   Do **not** set `FIREBASE_AUTH_EMULATOR_HOST` in Azure.

## 3. How roles work

Roles are decided by the API, never by the browser:

1. A `role` custom claim (`issuer` or `student`) on the Firebase user wins. Set it with the Admin SDK:
   `admin.auth().setCustomUserClaims(uid, { role: 'issuer' })`. The user gets it on their next token refresh.
2. Otherwise an email on `FIREBASE_ISSUER_EMAILS` becomes an issuer **only if the email is verified**.
3. Everyone else is a student.

A user who verifies their email after signing in keeps their old token until it refreshes; the restricted-access
screen has a **Refresh My Access** button for exactly this.

## 4. Operational notes

- The API caches Google's signing certificates (honouring `Cache-Control`), refetches at most once a minute, and keeps
  using recently expired keys for up to 24h if Google's endpoint is unreachable.
- Unchanged identities are re-synced to the `users` table at most every 30s; a changed role or name is written immediately.
- The `users.entra_id` column stores the Firebase UID (name kept to avoid a migration).
- `frontend/package.json` pins `@grpc/grpc-js` to `^1.14.6` via `overrides`. The `firebase` package depends on Firestore, which
  pulls in an older server-side gRPC library flagged by `npm audit`. The app only imports `firebase/auth`, so that code is not in
  the browser bundle; the override just keeps `npm audit` clean. It can be dropped once `firebase` ships a patched dependency.
