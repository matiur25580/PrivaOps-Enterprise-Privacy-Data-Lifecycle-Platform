# Architecture Overview

## Initial system boundary

PrivaOps starts as a TypeScript monorepo with a browser application, an HTTP API, and a shared-contract package.

- `apps/web`: React + Vite user interface.
- `apps/api`: Express API, runtime configuration, and MongoDB connection.
- `packages/shared`: framework-independent API contracts and shared types.
- `docs`: architecture decisions, security notes, and operational guidance.

## Runtime flow

1. The browser loads the React application from Vite.
2. The frontend calls the versioned Express API.
3. Express applies baseline HTTP security middleware and request logging.
4. Domain services (to be introduced in later milestones) enforce organization scope and permissions.
5. Mongoose provides persistence through MongoDB.

## Health endpoints

- `GET /health/live`: process liveness; does not imply dependencies are available.
- `GET /health/ready`: readiness; returns HTTP 503 until MongoDB is connected.
- `GET /api/v1`: API identity and version.

## Multi-tenancy requirement

Every organization-owned record must be scoped using a server-derived organization context. A client-supplied organization identifier is a selector, never proof of authorization. Authorization and tenant filtering must be tested at the service and API boundaries before business modules are considered production-ready.

## Security posture

The current scaffold provides baseline Helmet headers, a restricted CORS origin, bounded JSON request bodies, runtime environment validation, and request logging. It is not yet a production-ready security implementation. Authentication, authorization, rate limiting, secret management, audit-event design, and threat modeling are planned work.

## Local development

1. Install Node.js 22 or later and npm 10 or later.
2. Copy `.env.example` to `.env`.
3. Start MongoDB with `docker compose up -d mongodb`.
4. Run `npm install` at the repository root.
5. Run `npm run dev` to start the web and API workspaces.

The API starts only after it can connect to MongoDB. The web application is served at port 5173 and the API at port 4000.
