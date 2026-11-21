# Manual Deployment Runbook

This runbook is for an operator deploying the PrivaOps API and web client manually. It does not deploy anything, create cloud resources, or configure secrets on your behalf.

## 0. Deployment topology

Recommended first deployment:

- **Web:** Vercel, built from the monorepo root.
- **API:** Render Web Service, built from the same repository and branch.
- **Database:** a dedicated MongoDB Atlas database and database user.
- **Browser origin:** one exact HTTPS origin, configured as \`WEB_ORIGIN\`.

For the most reliable refresh-cookie behavior, use custom domains under the same registrable domain, for example \`app.example.com\` and \`api.example.com\`. Different registrable domains may be treated as third-party cookie contexts by browsers, where cookie restrictions can prevent refresh sessions from working even when CORS is configured correctly.

Deploy a preview/staging environment first. Use synthetic data only.

## 1. Prepare MongoDB Atlas

1. In Atlas, select or create a dedicated project for PrivaOps.
2. Create a database cluster in a region close to the API region.
3. Create a database user dedicated to this application. Grant only \`readWrite\` on the \`privaops\` database; do not use an Atlas organization owner or project owner credential in the application.
4. Configure Network Access to allow the API service's documented outbound IP addresses. Avoid \`0.0.0.0/0\` for production.
5. Copy the driver connection string and replace the placeholder username/password. URL-encode special characters in credentials.
6. Use a database name such as \`privaops\` in the URI path, and keep the URI in the API host's encrypted secret/environment-variable store.

Example shape only (not a real credential):

\`\`\`text
mongodb+srv://<db-user>:<url-encoded-password>@<cluster-host>/privaops?retryWrites=true&w=majority
\`\`\`

Never commit the URI or paste it into a frontend variable.

## 2. Deploy the API manually on Render

Create a **new Web Service** from the PrivaOps GitHub repository. Do not reuse another application's service or database.

| Setting | Value |
| --- | --- |
| Repository | \`matiur25580/PrivaOps-Enterprise-Privacy-Data-Lifecycle-Platform\` |
| Branch | \`main\` after PR #6 is reviewed and merged; otherwise use the reviewed feature branch |
| Root directory | Repository root (blank) |
| Runtime | Node |
| Node version | 22.x |
| Region | Choose the same/nearest supported region as MongoDB |
| Build command | \`npm install && npm run build --workspace @privaops/api\` |
| Start command | \`npm run start --workspace @privaops/api\` |
| Health check path | \`/health/ready\` |

Set these environment variables in the API service:

| Key | Value |
| --- | --- |
| \`NODE_ENV\` | \`production\` |
| \`MONGODB_URI\` | Atlas URI from step 1 |
| \`ACCESS_TOKEN_SECRET\` | New cryptographically random secret, at least 32 characters |
| \`WEB_ORIGIN\` | Exact public HTTPS origin of the web app, no trailing slash |
| \`ACCESS_TOKEN_TTL_SECONDS\` | \`900\` (optional default) |
| \`REFRESH_TOKEN_TTL_DAYS\` | \`7\` (optional default) |

The API defaults \`API_PORT\` to the hosting platform's injected \`PORT\` when present, or 4000 locally. Do not hard-code a port that conflicts with the platform.

Generate a secret locally, for example:

\`\`\`bash
openssl rand -base64 48
\`\`\`

Paste the generated value directly into the API provider's secret field. Do not put it in source control, a ticket, a screenshot, or a \`VITE_*\` variable.

After deployment, check:

- \`https://<api-host>/health/live\` returns HTTP 200.
- \`https://<api-host>/health/ready\` returns HTTP 200 with MongoDB connected.
- \`https://<api-host>/api/v1\` returns the API name and version.

If readiness returns 503, inspect API logs and Atlas Network Access, database user permissions, URI encoding, and cluster status. Do not expose the full connection string in logs or screenshots.

## 3. Deploy the web app manually on Vercel

Import the same repository as a Vercel project. Configure it from the **repository root**, not \`apps/web\`, because npm workspaces and shared dependencies live at the root.

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | Repository root |
| Install command | \`npm install\` |
| Build command | \`npm run build --workspace @privaops/web\` |
| Output directory | \`apps/web/dist\` |
| Node.js | 22.x |

Set this build-time environment variable for the intended environment:

\`\`\`dotenv
VITE_API_URL=https://<api-host>/api/v1
\`\`\`

\`VITE_API_URL\` is public browser configuration. Never place MongoDB credentials, JWT signing secrets, API keys, or other secrets in a \`VITE_*\` variable.

Redeploy/rebuild the web project after changing \`VITE_API_URL\`; Vite embeds it into the generated browser bundle.

## 4. Configure transactional email

1. Create a Resend account and verify a sending domain.
2. Generate an API key with permission to send mail and store it as `RESEND_API_KEY` in the API service only.
3. Set `EMAIL_FROM` to an address on the verified sending domain.
4. Send a test verification email and a test password-reset email. Confirm both links open the exact `WEB_ORIGIN` and expire after 30 minutes.
5. Do not expose the provider key through `VITE_*` variables or commit it to source control.

## 5. Match origins and cookie behavior

1. Set API \`WEB_ORIGIN\` to the exact Vercel/custom web origin, including scheme and host, with no path or trailing slash. Example: \`https://app.example.com\`.
2. Confirm the web app sends requests to the API's \`/api/v1\` base path.
3. The API uses credentialed CORS for that single configured origin.
4. Registration, login, refresh, and logout require the browser \`Origin\` header to exactly match \`WEB_ORIGIN\`.
5. Production refresh cookies use \`Secure\` and \`SameSite=None\` to support cross-site requests. Browsers may still block third-party cookies. Prefer a same-site custom-domain topology and test in the browsers your users actually use.
6. Both web and API must use HTTPS. Do not try to work around cookie failures by disabling browser security.

If your hosting provider uses a different canonical domain after custom-domain setup, update \`WEB_ORIGIN\` and rebuild/redeploy as appropriate.

## 6. Smoke-test the complete workflow

Use a new synthetic workspace and fictional user. Do not use real customer or employee information.

- [ ] Web page loads without browser console errors.
- [ ] Register a new test organization and owner.
- [ ] Refresh the page; session restoration succeeds.
- [ ] Log out; protected workspace content is no longer accessible.
- [ ] Log in again.
- [ ] Create a data asset and verify it appears in inventory.
- [ ] Create a processing activity and link it to an existing asset.
- [ ] Submit a synthetic privacy request.
- [ ] As owner/admin, assign it to a member and set an operational due date.
- [ ] Verify a request cannot be fulfilled before identity verification is marked verified and required resolution information is supplied.
- [ ] Open request event history and owner/admin audit activity.
- [ ] Export inventory/processing data as CSV and inspect the exported columns for unintended sensitive data.
- [ ] Verify member/viewer accounts cannot access owner/admin-only actions.
- [ ] Verify a user from another organization cannot read or modify the first organization's records by changing URL IDs.
- [ ] Confirm \`/health/ready\` remains healthy after the smoke test.

If refresh fails but login appears to work, inspect cookie presence, HTTPS, SameSite/third-party-cookie policy, exact Origin, CORS credentials, and domain topology.

## 7. Operational hardening before real data

- [ ] Review dependency audit output and remediate high/critical findings with compatibility testing.
- [ ] Enable provider log retention, alerts, and uptime monitoring; redact secrets and personal data from logs.
- [ ] Configure database backups and perform a restore drill.
- [ ] Define database retention, deletion, access-review, and incident-response procedures.
- [ ] Restrict database user privileges and network access; rotate credentials and signing secrets.
- [ ] Complete a threat model and independent security review.
- [ ] Add integration/E2E tests for cross-tenant authorization and session/cookie flows.
- [ ] Review CSRF protections and browser cookie behavior for the final domain topology.
- [ ] Add email verification, MFA, password recovery, and invitation lifecycle before broad organizational use.
- [ ] Protect audit evidence outside the primary application database and verify integrity independently.

The current audit stream is application-level operational metadata; it is not an independently tamper-proof compliance ledger. PrivaOps is not a legal compliance certification and must not be used to infer legal compliance from a dashboard status.

## 7. Rollback and release discipline

1. Keep the previous known-good API and web deployment identifiers.
2. For a bad frontend release, promote the previous successful Vercel deployment.
3. For a bad API release, roll back to the previous successful Render deploy.
4. Avoid destructive database migrations during the first release; back up before any schema/data migration.
5. Confirm readiness and smoke-test login, refresh, tenant isolation, and request workflow after rollback.

## Release sign-off

Record the release commit SHA, API deployment identifier, web deployment identifier, database backup timestamp, smoke-test result, and operator who approved the release. Do not record secrets or raw personal data in the release note.
