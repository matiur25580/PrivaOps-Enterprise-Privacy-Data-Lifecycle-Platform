# Security Notes and Threat Model

This document describes the current engineering controls and the remaining work. It is not a certification or a claim that the application is safe for production personal data.

## Assets to protect

- User credentials and refresh sessions.
- Organization membership, roles, and tenant-owned records.
- Data inventory and processing metadata.
- Privacy request descriptions, identity-verification state, and resolution evidence.
- Audit events and operational configuration.
- Database credentials, token-signing secrets, and deployment configuration.

## Trust boundaries

| Boundary | Threat | Current control |
| --- | --- | --- |
| Browser → API | Unauthenticated or malformed requests | JWT authentication, Zod validation, auth rate limits |
| User → organization | Forged organization identifier | Token-derived organization context and scope middleware |
| Tenant A → tenant B | IDOR / cross-tenant reads and writes | Organization-scoped filters and same-tenant reference validation |
| User role → action | Privilege escalation | Server-side explicit permission matrix |
| Browser session | Token theft from persistent browser storage | Access token kept in memory; refresh token in HttpOnly cookie |
| Refresh flow | Replay / parallel refresh race | Hashed opaque token, atomic consume-and-rotate |
| Workflow operator | Premature request fulfillment | Identity verification and transition checks |
| Audit consumer | Exposure of personal-data values | Event metadata records changed field names, not field values |

## Important residual risks

1. **Account lifecycle:** email verification, password recovery, invitations, and account lockout policy are not implemented. TOTP MFA, one-time recovery codes, and a self-service browser security settings screen are implemented. Email verification and password recovery remain outstanding.
2. **Cookie/CSRF posture:** cookie-authenticated registration, login, refresh, and logout require an exact match with the configured WEB_ORIGIN. Production refresh cookies use Secure + SameSite=None so a separately hosted browser app can send them. Verify the exact deployed origin, HTTPS, browser third-party-cookie behavior, and the final domain topology; prefer same-site custom domains where possible.
3. **Access-token revocation:** access tokens are short-lived; refresh-session logout does not instantly revoke an already-issued access token. Membership and account state are reloaded, but session-level revocation is not checked on every request.
4. **Registration/session semantics:** review registration response and cookie behavior, organization selection, and duplicate-registration race handling.
5. **Audit integrity:** the current append-oriented event collection is not immutable. Database administrators can alter it; independent retention, integrity verification, and privileged access monitoring are needed.
6. **Sensitive data minimization:** privacy request descriptions may contain personal data. Define retention, access, redaction, and deletion rules before production use.
7. **Availability and abuse:** add distributed rate limiting, request timeouts, payload limits per route, operational alerting, backup/restore drills, and dependency vulnerability management.
8. **Operational secrets:** use a secret manager, rotate keys, scope database credentials, and keep secrets out of frontend build variables and logs.

## Role model

- **Owner / Admin:** manage inventory and processing records, read the organization privacy queue, update request workflow, and read inventory audit activity.
- **Member:** read inventory and submit/read own privacy requests.
- **Viewer:** read inventory only.

The API is authoritative. Frontend role-based visibility is only a usability affordance.

## Pre-production checklist

- [ ] Complete an application-specific threat model and security review.
- [ ] Add email verification, password recovery, and secure invitation flows.
- [ ] Add integration tests for TOTP enrollment, login challenge replay, and MFA disable/session revocation.
- [ ] Review CSRF defenses, cookie flags, origin validation, and CORS configuration against deployed domains.
- [ ] Add integration tests for authentication, role permissions, and cross-tenant IDOR attempts.
- [ ] Add end-to-end tests for registration, login, refresh rotation, logout, inventory, and privacy-request lifecycle.
- [ ] Add database backups, restore testing, monitoring, and alerting.
- [ ] Review dependency vulnerabilities and pin/maintain supported runtime versions.
- [ ] Establish data retention, deletion, access review, and incident-response procedures.
- [ ] Protect audit evidence outside the primary application database and verify integrity independently.
- [ ] Use synthetic demo data and verify that logs contain no secrets or unnecessary personal data.

## Safe demo rules

Use synthetic people, email addresses under reserved example domains, fictional organizations, and non-production identifiers. Do not paste real subject requests or production data into the portfolio demo.
