# Server README

This folder contains the backend for the PMP platform.

## What the server provides

- Express.js API layer
- Authentication and authorization flow
- PostgreSQL database access
- Socket.IO real-time event handling
- Role-based project and dashboard logic
- Database migration and seeding utilities

## Tech Stack

- Node.js
- TypeScript
- Express
- PostgreSQL
- Socket.IO
- JWT and bcrypt
- Jest for backend tests

## Running locally

```bash
cd server
npm install
npm run dev
```

## Main scripts

```bash
npm run dev        # run the server in development mode
npm run build      # compile TypeScript to dist
npm run start      # start the compiled server
npm run test       # run backend tests
npm run migrate    # apply database migrations
npm run seed:admin # add admin cred to the db. 
```

## Environment variables

The server expects configuration values for database access, authentication, Azure integration, and CORS. A typical setup includes:

- PORT
- DATABASE_URL or DB_HOST / DB_NAME / DB_USER / DB_PASSWORD
- JWT_SECRET
- AZURE_TENANT_ID
- AZURE_CLIENT_ID
- AZURE_CLIENT_SECRET
- AZURE_REDIRECT_URI
- CORS_ORIGIN

## Project structure highlights

- src/index.ts: application entry point
- src/routes/: API route modules
- src/middleware/: auth and role middleware
- src/scripts/: seed and import helpers
- src/utils/: reusable utilities
- migrations/: SQL migration files

## Notes

A few standalone utility files are present in the repository root and server workspace for maintenance tasks. They are not part of the main request flow, but they remain available for debugging or one-off database operations.
