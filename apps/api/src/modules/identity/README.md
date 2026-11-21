# Identity and tenant security

## Implemented endpoints

All endpoints are mounted below `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a pending account and send a verification email |
| POST | `/auth/email/verify` | Verify an expiring, one-time email token |
| POST | `/auth/email/verification/resend` | Resend verification link with a generic response |
| POST | `/auth/password/forgot` | Request a password reset link without account enumeration |
| POST | `/auth/password/reset` | Change password and revoke refresh sessions |
| POST | `/auth/email/verify` | Verify an expiring, one-time email token |
| POST | `/auth/email/verification/resend` | Resend verification link with a generic response |
| POST | `/auth/password/forgot` | Request a reset link without account enumeration |
| POST | `/auth/password/reset` | Change password and revoke refresh sessions |
| POST | `/auth/login` | Authenticate; returns an MFA challenge when TOTP is enabled |
| POST | `/auth/mfa/verify-login` | Complete a one-time challenge with TOTP or recovery code |
| GET | `/auth/mfa/status` | Return MFA state and remaining recovery-code count |
| POST | `/auth/mfa/setup` | Create a pending TOTP authenticator secret |
| POST | `/auth/mfa/confirm` | Verify and enable TOTP MFA |
| POST | `/auth/mfa/recovery-codes` | Replace recovery codes after password + TOTP verification |
| POST | `/auth/mfa/disable` | Disable MFA after password + TOTP verification; revoke refresh sessions |
| POST | `/auth/refresh` | Rotate an opaque refresh session stored as a hash |
| POST | `/auth/logout` | Revoke the refresh session and clear its cookie |
| GET | `/auth/me` | Return the authenticated user and selected organization |
| GET | `/organizations/:organizationId/context` | Return the current organization context |
| GET | `/organizations/:organizationId/members` | List active organization members |

## Authentication model

- Passwords are hashed with Argon2id; plaintext passwords are never persisted.
- New registrations remain pending until the email address is verified. Existing user records without the flag remain compatible.
- Verification and password-reset tokens are 256-bit random values; only SHA-256 hashes are stored. Tokens expire after 30 minutes and are consumed once.
- Password reset revokes all refresh sessions. Forgot-password and resend-verification responses do not reveal whether an email is registered.
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

Set `ACCESS_TOKEN_SECRET` to a random value of at least 32 characters. In production, configure `RESEND_API_KEY` and a verified `EMAIL_FROM` sender. In development, account-action links are logged to the API console. Generate one with:

```bash
openssl rand -base64 48
```

The value in `.env.example` is a placeholder only and must be replaced for local use. Never commit real secrets.
