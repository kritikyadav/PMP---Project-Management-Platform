# PMP - Project Management Platform

A full-stack project management platform for planning, tracking, and reviewing project health across different stakeholder roles. The application combines a React-based dashboard experience with a Node.js and PostgreSQL backend for authentication, project data, role-based access, and real-time updates.

## Overview

This repository is split into two main parts:

- Client: a Vite + React + TypeScript frontend for admins, project managers, program managers, and CXO users
- Server: an Express + TypeScript API with PostgreSQL persistence, authentication, and Socket.IO real-time features

## Key Features

- Role-based dashboards for admin, PM, program manager, and CXO users
- Project creation and portfolio tracking workflows
- Authentication with standard credentials and Microsoft 365-based sign-in flow
- Real-time activity updates and dashboard events
- Password reset and session management
- API health checks and database-backed project operations
- Email delivery via Resend for password reset and notification workflows

## Project Structure

- client/: frontend application
- server/: backend API and data layer
- migrations/: SQL migration scripts for the database
- server/scripts/: utility scripts for seeding and importing data

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL database

## Quick Start

### 1. Clone and install dependencies

```bash
git clone <repository-url>
cd "PMP - Project Management Platform"

cd client && npm install
cd ../server && npm install
```

### 2. Configure environment variables

Create a `.env` file in the server folder with required values such as:

```env
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/pmp
JWT_SECRET=your-secret-key
RESEND_API_KEY=your-resend-api-key
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_REDIRECT_URI=http://localhost:4000/auth/callback
CORS_ORIGIN=http://localhost:5173
```

### 3. Run the application

Start the backend:

```bash
cd server
npm run dev
```

Start the frontend:

```bash
cd client
npm run dev
```

The frontend should be available at http://localhost:5173 and the backend at http://localhost:4000.

## Useful Commands

### Client

```bash
cd client
npm run dev
npm run build
npm run test
```

### Server

```bash
cd server
npm run dev
npm run build
npm run test
npm run migrate
```

## Notes on Repository Health

During a review of the current workspace, a few utility files appeared to be present but not directly wired into the main runtime flow. These were left in place as maintenance helpers and can be removed later if the team decides they are no longer needed.

## Email Service Note

This project uses Resend for email delivery. The RESEND_API_KEY environment variable is required for features such as password reset emails and other notification-based flows. Make sure the key is set in the server environment before running the application.

## Recommended Before Push

- Review environment variables and secrets
- Ensure the database is migrated and accessible
- Confirm both client and server build successfully
- Add screenshots or architecture diagrams for a more polished GitHub presentation
