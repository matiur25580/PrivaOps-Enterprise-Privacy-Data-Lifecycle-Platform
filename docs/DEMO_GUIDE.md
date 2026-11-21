# PrivaOps — 5-Minute Portfolio Demo

This guide helps demonstrate the product as an operational privacy system rather than a collection of CRUD screens. Use a fresh workspace and synthetic information only. No pre-seeded demo credentials are included.

## Demo story

You are presenting a fictional organization, **Northstar Commerce**, that needs to understand where customer data lives, document why it is processed, and respond to privacy requests with traceable operational steps.

### 1. Establish the workspace (45 seconds)

- Register a workspace named Northstar Commerce with a fictional operator identity.
- Point out that the API returns an organization context and the UI uses the server-returned organization name and role.
- Explain that organization IDs in URLs do not grant access: the API validates the JWT, active membership, and requested organization scope.

### 2. Register a data asset (60 seconds)

Create a synthetic asset:

| Field | Example |
| --- | --- |
| Name | Customer CRM |
| System | Northstar CRM |
| Owner team | Customer Operations |
| Classification | Confidential |
| Data categories | Identity, contact, support history |
| Data subjects | Customers |

Explain that classification and ownership make the inventory actionable. The list supports search, filters, archive, and CSV export.

### 3. Document processing (60 seconds)

Create a processing activity:

| Field | Example |
| --- | --- |
| Activity | Customer support case management |
| Purpose | Respond to customer support enquiries |
| Legal-basis category | Contract (illustrative only) |
| Data categories | Identity, contact, support history |
| Data subjects | Customers |
| Systems | Northstar CRM |
| Retention period | 365 days (example policy value) |

Explain that this is an operational register. The selected legal-basis category and retention period are not legal advice and should be validated by qualified reviewers. The platform does not automatically execute deletion.

### 4. Follow a privacy request (90 seconds)

- Submit a synthetic access request with a short, non-sensitive description.
- Open request details and show the event timeline.
- As the organization owner/admin, assign the request to an active organization member and set an operational due date.
- Demonstrate the identity-verification state and a valid next status.
- Explain that fulfillment is blocked until identity verification is marked verified and a resolution summary is supplied.

### 5. Show auditability and export (45 seconds)

- Open Audit activity as owner/admin.
- Show actor, action, resource ID, changed field names, and timestamps.
- Export the inventory or processing register as CSV.

Explain the actual guarantee: audit events are append-oriented metadata in the application database, not independently immutable evidence. A production system needs protected storage, independent integrity verification, privileged-access monitoring, and defined retention controls.

## Architecture discussion prompts

Be ready to explain:

- **Authentication:** Argon2id password hashing, short-lived JWT access token, opaque refresh token hashed at rest, HttpOnly cookie, atomic refresh rotation.
- **Tenant isolation:** authenticated organization scope is derived server-side; database filters include the organization ID; related asset references are validated within the same tenant.
- **Authorization:** the API permission matrix is authoritative; UI visibility is not a security boundary.
- **Workflow correctness:** privacy request state transitions are explicit; fulfillment requires verified identity and resolution evidence.
- **Privacy by design:** system fonts avoid a third-party font request; audit metadata omits before/after field values; browser access tokens are held in memory rather than persistent web storage.
- **Operational readiness:** liveness and readiness endpoints are distinct; runtime configuration validates required secrets; platform-injected PORT is supported.

## Honest limitations to disclose

The current milestone does not implement email verification, MFA, password recovery, invitations, consent lifecycle, automated retention execution, incident response, vendor risk, DPIA workflows, notifications, background jobs, or independently tamper-resistant audit evidence. Production use requires threat review, CSRF/cookie review, integration and end-to-end tests, dependency review, backups, monitoring, and legal/privacy review.

A strong interview answer distinguishes implemented controls from roadmap items and explains why a privacy platform must not claim compliance simply because it stores a legal-basis label.
