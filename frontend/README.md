# Client README

This folder contains the frontend for the PMP platform.

## What the client does

- Presents role-based dashboards for admins, PMs, program managers, and CXO users
- Supports project creation, portfolio review, and milestone workflows
- Integrates with the backend API for authentication and project data
- Displays real-time dashboard activity through Socket.IO

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Vitest for tests

## Running locally

```bash
cd client
npm install
npm run dev
```

The development server will start at http://localhost:5173.

## Main scripts

```bash
npm run dev
npm run build
npm run test
npm run preview
```

## Project structure highlights

- src/App.tsx: main app shell and login flow
- src/pages/: dashboard views by role
- src/components/: reusable UI and feature components
- src/api/: API integration layer
- src/realtime/: real-time dashboard socket integration

## Notes

The styling is primarily driven by Tailwind and shared UI components. A small stylesheet file is present in the source tree but does not appear to be actively referenced by the current app entry flow.
