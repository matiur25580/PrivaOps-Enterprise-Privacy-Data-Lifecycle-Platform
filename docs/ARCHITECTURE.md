# Architecture Overview

## System boundary

PrivaOps is a TypeScript monorepo with a browser application, HTTP API, and shared package boundary.

- `apps/web`: Next.js 16 App Router + React 19 workspace.
- `apps/api`: Express 5 API, environment validation, MongoDB connection.
- `packages/shared`: framework-independent shared contracts.
- `docs`: architecture, security posture, and operator guidance.

## Runtime flow

1. Next.js serves the App Router shell and hydrates the existing interactive React workspace.
2. The frontend calls the versioned API at `/api/v1`.
3. Express applies Helmet, credentialed CORS for the configured origin, bounded JSON parsing, cookie parsing, and structured request logging.
4. Authentication verifies JWT claims, reloads the user and active membership, and derives organization scope server-side.
5. Domain routes apply role permissions and organization-scoped database filters.
6. Mongoose persists domain records and operational metadata in MongoDB.

## Implemented domain modules

### Identity and tenancy

- Users, organizations, memberships, and refresh sessions.
- Argon2id password hashing.\n- Optional TOTP MFA with encrypted secret storage, confirmed enrollment, and a short-lived second-factor login challenge.
- Short-lived JWT access tokens and hashed, rotating refresh tokens in HttpOnly cookies.
- Membership is revalidated on authenticated requests.
- Explicit owner/admin/member/viewer permission matrix.

### Data inventory and processing register

- Organization-scoped data assets with classification, systems, owner teams, categories, and data subjects.
- Processing activities with purpose, operational legal-basis category, systems, asset references, and retention period.
- Soft archive, pagination, search, and server-side validation.
- Inventory audit events store actor, action, resource, and changed field names.

### Privacy request workflow

- Request intake and role-sensitive list visibility.
- Status transition validation and identity-verification gate before fulfillment.
- Resolution summary / rejection reason requirements.
- Request event history and requester withdrawal.

## API health

- `GET /health/live`: process liveness; does not imply dependencies are available.
- `GET /health/ready`: readiness; returns 503 until MongoDB is connected.
- `GET /api/v1`: API identity and version.
- API listen port defaults to the platform-provided `PORT`, or 4000 locally.

## Multi-tenancy invariants

- A client-supplied organization ID is a selector, never proof of authorization.
- JWT organization claims are validated and compared with the requested organization.
- Active user, membership, and organization records are checked on each authenticated request.
- Every organization-owned read/write query must include the server-derived organization ID.
- Related record IDs (for example, asset IDs in a processing activity) must be validated inside the same organization.
- Cross-tenant access should fail closed and should not reveal whether another tenant's record exists.

## Frontend session behavior

- Access tokens remain in JavaScript memory; they are not written to localStorage or sessionStorage.
- Refresh uses an HttpOnly cookie and a single in-flight refresh promise to avoid parallel rotation races.
- A 401 response may trigger one refresh attempt and one retry.
- The API base URL includes `/api/v1`; browser environment variables must never contain secrets.

## Audit semantics

The current audit stream is append-oriented application metadata, not a cryptographically immutable ledger. Events contain action, actor, resource identifier, and changed field names. They intentionally omit before/after values to reduce sensitive-data exposure. Production-grade evidence requires additional storage protections, independent integrity verification, privileged-access monitoring, and retention controls.

## Security posture

Baseline controls include Helmet, a restricted CORS origin, bounded JSON request bodies, rate-limited authentication endpoints, runtime environment validation, Argon2id, refresh-token rotation, RBAC, tenant-scoped queries, and workflow validation.

This is not a production security certification. See [SECURITY.md](SECURITY.md) for known limitations and the operator hardening checklist.

## Local development

1. Use Node.js 22+ and npm 10+.
2. Copy `.env.example` to `.env` and generate a unique `ACCESS_TOKEN_SECRET`.
3. Start MongoDB with `docker compose up -d mongodb`.
4. Run `npm install` from the repository root.
5. Set `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` in `apps/web/.env`.
6. Run `npm run dev`.


## Frontend feature module boundaries

The web client is incrementally organized under `apps/web/src/features` and `apps/web/src/lib`:

- Feature folders own their domain data contracts; privacy requests also own workflow transition metadata and the request-detail/timeline component.
- `lib/api-client.ts` centralizes credentialed transport, in-memory bearer-token handling, refresh single-flight, and one-time retry.
- `lib/csv.ts` and `lib/format.ts` contain shared presentation utilities.
- `App.tsx` remains the cross-feature workspace orchestrator during this staged migration.

See [FRONTEND_FEATURE_MODULES.md](FRONTEND_FEATURE_MODULES.md) for the detailed module map, tests, and security invariants.
