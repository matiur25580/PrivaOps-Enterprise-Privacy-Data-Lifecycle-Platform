# Privacy request workflow

This module provides an organization-scoped operational workflow for authenticated employees to submit and track privacy requests, and for authorized privacy operators to triage and resolve them.

## Endpoints

- `GET /api/v1/organizations/:organizationId/privacy-requests?page=1&limit=20&status=&requestType=` — owners/admins
- `POST /api/v1/organizations/:organizationId/privacy-requests` — active members and above
- `GET /api/v1/organizations/:organizationId/privacy-requests/mine?page=1&limit=20&status=&requestType=` — requesters' own queue
- `GET /api/v1/organizations/:organizationId/privacy-requests/:requestId` — owners/admins; requesters may read their own
- `GET /api/v1/organizations/:organizationId/privacy-requests/:requestId/events` — same visibility as the request
- `POST /api/v1/organizations/:organizationId/privacy-requests/:requestId/withdraw` — request owner; only before a terminal outcome
- `PATCH /api/v1/organizations/:organizationId/privacy-requests/:requestId` — owners/admins

Supported request types: access, correction, erasure, portability, withdraw consent, restriction, objection, and other.

## Lifecycle

`submitted → identity_verification → in_progress ↔ awaiting_information → fulfilled/rejected → closed`

Requests may be withdrawn before a terminal outcome. Invalid transitions return `409 INVALID_STATUS_TRANSITION`. The workflow is an operational state machine; it does not determine legal eligibility, validate identity, or calculate statutory deadlines.

## Security and audit

- Tenant scope is derived from the authenticated membership, never from request-body organization IDs.
- Requesters are assigned from the authenticated user; clients cannot submit on behalf of another account.
- Members can read only their own requests; owners/admins can read and manage organization requests. Viewers have no privacy-request access.
- Assignees must be active members of the same organization.
- Every update is tenant-scoped and uses an expected current status to detect concurrent changes.
- Event records capture actor, action, request ID, and changed field names only—not submitted descriptions, identity documents, or other personal-data values.
- Event history is append-only at the application layer, not cryptographically immutable or tamper-proof.

This is a workflow foundation, not legal advice or a guarantee of compliance. Identity verification, external data-subject intake, evidence handling, deadline rules, notifications, and integrations are future work and require organization-specific policy review.
