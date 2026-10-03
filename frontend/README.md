# Frontend — React (Vite)

Certificate Digitization & Verification Pipeline — React frontend.

## Setup

```bash
npm install
npm run dev
```

## Routes

- `/` — Landing / login
- `/issuer` — Issuer dashboard (bulk upload, all jobs)
- `/issuer/review` — Review screen (resolve `needs_review` flags, confirm student uploads)
- `/student` — Student dashboard (own uploads, status)
- `/verify/:id` — Public verification page (hash + QR lookup)
