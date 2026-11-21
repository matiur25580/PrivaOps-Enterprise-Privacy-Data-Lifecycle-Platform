# Identity and tenant security

## Implemented endpoints

All endpoints are mounted below `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a user, organization, owner membership, and session |
| POST | `/auth/login` | Authenticate and select an active organization membership |
| POST | `/auth/refresh` | Rotate an opaque refresh session stored as a hash |
| POST | `/auth/logout` | Revoke the refresh session and clear its cookie |
| GET | `/auth/me` | Return the authenticated user and selected organization |
| GET | `/organizations/:organizationId/context` | Return the current organization context |
| GET | `/organizations/:organizationId/members` | List active organization members |

## Authentication model

- Passwords are hashed with Argon2id; plaintext passwords are never persisted.
- Access tokens are short-lived signed JWTs (15 minutes by default).
- Refresh tokens are random opaque values. Only SHA-256 hashes are stored in MongoDB.
- Refresh tokens are delivered in an HttpOnly cookie scoped to the auth path. Development uses SameSite=Lax; production uses Secure + SameSite=None for separately hosted browser/API origins. Prefer same-site custom domains and verify browser third-party-cookie behavior.
- Refresh rotation deletes the old session before issuing a new one.
- Login and registration are rate-limited.
- Login performs a dummy Argon2id verification when an account is unknown or inactive, reducing account-enumeration timing differences.
- The API reloads the active user and organization membership for each authenticated request. A role claim from the browser is never trusted.

## Tenant isolation

The selected organization is embedded in the signed access token. The API verifies that the user still has an active membership for that organization and derives the role from MongoDB. Organization-scoped routes compare the route organization ID with the authenticated organization ID and use the authenticated ID in database filters.

Do not build organization-owned queries from a client-supplied tenant ID alone. New domain repositories must accept a trusted `AuthContext` and always scope reads and writes by `auth.organizationId`.

## Local secrets

Set `ACCESS_TOKEN_SECRET` to a random value of at least 32 characters. Generate one with:

```bash
openssl rand -base64 48
```

The value in `.env.example` is a placeholder only and must be replaced for local use. Never commit real secrets.
