# PrivaOps — Enterprise Privacy & Data Lifecycle Operations

PrivaOps is a multi-tenant privacy operations workspace built to help teams understand the personal data they hold, document processing activities, coordinate data-subject requests, and retain operational evidence in one place.

It is an engineering portfolio project focused on practical privacy operations—not a legal compliance product or certification.

[![CI](https://github.com/matiur25580/PrivaOps-Enterprise-Privacy-Data-Lifecycle-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/matiur25580/PrivaOps-Enterprise-Privacy-Data-Lifecycle-Platform/actions/workflows/ci.yml)

## Product capabilities

### Implemented

| Area | Capability |
| --- | --- |
| Identity | Organization registration, login, Argon2id password hashing, short-lived JWT access tokens, rotating opaque refresh sessions |
| Multi-tenancy | Organization membership, server-derived tenant scope, role-based authorization |
| Data inventory | Searchable and filterable data assets, classification, owners, data categories and subjects, soft archive |
| Processing register | Processing purpose, operational legal-basis classification, data categories, systems, linked assets and retention period |
| Privacy requests | Intake, own-request visibility, organization queue for authorized roles, identity-verification state, lifecycle transitions, withdrawal and event history |
| Audit history | Organization-scoped inventory audit events, actor metadata, changed-field names and role-restricted read access |
| Web workspace | Responsive dashboard, operational signals, search, filters, request detail timeline, CSV exports |
| Engineering quality | TypeScript monorepo, ESLint, Vitest, CI lint/typecheck/test/build pipeline, environment validation and health endpoints |

### Deliberately not claimed as complete

Email verification, MFA, invitations, password recovery, consent lifecycle management, retention execution, incident response, vendor risk, DPIA workflows, evidence attachments, notifications, background jobs, and independent audit-log tamper resistance remain future work. Do not interpret a dashboard indicator as proof of legal compliance.

## Technology

- **Frontend:** React 19, Vite 6, TypeScript
- **API:** Node.js 22+, Express 5, TypeScript, Zod
- **Persistence:** MongoDB and Mongoose
- **Identity:** Argon2id, JWT access tokens, hashed rotating refresh tokens, HttpOnly cookies
- **Quality:** ESLint, Vitest, GitHub Actions

The frontend uses system fonts and does not load third-party font assets at runtime.

## Repository structure

```text
apps/
  api/       Express API, identity, inventory and privacy-request modules
  web/       React workspace
packages/
  shared/    Shared package boundary
docs/
  ARCHITECTURE.md
  SECURITY.md
```

## Run locally

Requirements: Node.js 22 or later, npm 10 or later, and MongoDB (local Docker or an accessible instance).

1. Copy the root environment template:

   ```bash
   cp .env.example .env
   ```

2. Set a unique API secret. For example:

   ```bash
   openssl rand -base64 48
   ```

   Put the generated value in `ACCESS_TOKEN_SECRET`. Never commit a real secret.

3. Start MongoDB if using the included Docker Compose service:

   ```bash
   docker compose up -d mongodb
   ```

4. Install and run the monorepo:

   ```bash
   npm install
   npm run dev
   ```

5. In `apps/web/.env`, set the API base URL including the version prefix:

   ```dotenv
   VITE_API_URL=http://localhost:4000/api/v1
   ```

The web app runs at `http://localhost:5173`; the API runs at `http://localhost:4000` by default.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `API_PORT` | API listen port; defaults to the platform `PORT` when present, otherwise 4000 |
| `WEB_ORIGIN` | Exact browser origin allowed by credentialed CORS |
| `MONGODB_URI` | MongoDB connection URI |
| `ACCESS_TOKEN_SECRET` | Required secret with at least 32 characters |
| `ACCESS_TOKEN_TTL_SECONDS` | Access-token lifetime (300–3600 seconds) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh-session lifetime (1–30 days) |
| `VITE_API_URL` | Browser-visible API URL including `/api/v1`; never put secrets in `VITE_*` variables |

The API requires `MONGODB_URI` and `ACCESS_TOKEN_SECRET` to be valid before it starts. The web app's `.env.example` is in `apps/web/`.

## Quality checks

Run from the repository root:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

CI runs the same checks on pull requests and pushes to `main`.

## API surface

The versioned API is mounted under `/api/v1`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a user and organization |
| POST | `/auth/login` | Authenticate and issue a session |
| POST | `/auth/refresh` | Rotate refresh session |
| POST | `/auth/logout` | Revoke refresh session |
| GET | `/auth/me` | Current authenticated identity |
| GET | `/organizations/:id/context` | Current organization context |
| GET/POST | `/organizations/:id/data-assets` | List and register assets |
| PATCH/DELETE | `/organizations/:id/data-assets/:assetId` | Update or archive an asset |
| GET/POST | `/organizations/:id/processing-activities` | List and register processing activities |
| PATCH/DELETE | `/organizations/:id/processing-activities/:activityId` | Update or archive an activity |
| GET | `/organizations/:id/audit-events` | Read inventory audit history (owner/admin) |
| GET/POST | `/organizations/:id/privacy-requests` | Read queue and submit requests |
| GET | `/organizations/:id/privacy-requests/mine` | Read own requests |
| GET | `/organizations/:id/privacy-requests/:requestId/events` | Read request event history |
| PATCH | `/organizations/:id/privacy-requests/:requestId` | Update workflow (owner/admin) |
| POST | `/organizations/:id/privacy-requests/:requestId/withdraw` | Withdraw own request |
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | MongoDB readiness |

## Security model and known limitations

- Organization IDs from URLs are selectors, never authorization. The API derives the authenticated organization from the verified token and active membership.
- Data access and audit queries are organization-scoped on the server.
- Roles are enforced by API middleware; hiding a UI control is not considered authorization.
- Passwords are hashed with Argon2id. Refresh tokens are opaque, hashed at rest, rotated, and delivered in an HttpOnly cookie.
- The browser keeps the short-lived access token in memory, not local storage. A 401 response attempts one refresh and retries the request.
- Audit events store action/resource metadata and changed-field names, not before/after personal-data values.
- Hashing or append-oriented writes alone do not guarantee immutable audit evidence. Production deployments need protected storage, least-privilege access, independent monitoring, backups, and an external integrity strategy.
- Production hardening still requires a threat model, CSRF review for cookie-authenticated flows, email verification, MFA, account recovery, dependency review, secrets management, rate-limit strategy, and integration/end-to-end testing.

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Manual deployment handoff

Deployment is intentionally an operator-controlled step. No deployment is performed by the repository workflow.

Before deploying:
1. Provision a dedicated MongoDB database and a least-privilege database user.
2. Set API environment variables securely: `NODE_ENV=production`, `MONGODB_URI`, `ACCESS_TOKEN_SECRET`, and the exact `WEB_ORIGIN`.
3. Ensure the API platform's injected `PORT` is honored (the API defaults `API_PORT` to `PORT` when available).
4. Set the frontend's `VITE_API_URL` to the API origin plus `/api/v1`, then build the web app.
5. Configure HTTPS, secure cookie behavior, allowed origins, MongoDB network access, backups, monitoring, and rollback procedures.
6. Verify `/health/live`, `/health/ready`, authentication, tenant boundaries, and role restrictions using synthetic data.

A successful frontend build does not prove that the API, database, cookies, or end-to-end workflows are production-ready.

## Regulatory and demo guidance

PrivaOps can support configurable operational mappings to privacy frameworks, but applicability and legal interpretation must be reviewed by qualified professionals. India DPDP, GDPR, and other regulatory obligations can have different scopes, timelines, and exceptions; this software does not determine them.

Use synthetic identities and records in demos. Never put real personal data, access tokens, database URIs, or production secrets into screenshots, issues, commits, or test fixtures.

## License

No license has been selected. Unless and until one is added, all rights are reserved by the repository owner.
