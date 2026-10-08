# Frontend (React + Vite)

Certificate Digitization & Verification Pipeline: React frontend.

## Setup

```bash
npm install
npm run dev
```

## Routes

- `/` : Landing / verification entry
- `/issuer` : Issuer dashboard (registry, status filters)
- `/issuer/review` : Review screen (human-in-the-loop review station)
- `/student` : Student portal (upload certificates, live tracking)
- `/verify/:id` : Public verification page (hash + QR lookup)
