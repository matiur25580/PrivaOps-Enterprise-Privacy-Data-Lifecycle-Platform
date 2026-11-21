# Next.js App Router Migration

## What changed

The web workspace now runs on **Next.js 16.4.6** using the App Router.

- `apps/web/app/layout.tsx` owns the document shell, metadata, viewport, and global stylesheet.
- `apps/web/app/page.tsx` is the server-rendered route entry point.
- `apps/web/app/PrivaOpsClient.tsx` is the explicit client boundary for the existing interactive workspace.
- The existing React workspace in `apps/web/src/App.tsx` is retained to preserve authentication, MFA, inventory, processing, request workflows, audit views, and CSV export behavior.
- The API remains a separately deployed Express 5 service. This preserves the existing security boundary and avoids an unsafe backend rewrite during a frontend framework migration.

## Runtime and environment

- Web development server: `http://localhost:3000`
- API development server: `http://localhost:4000`
- Public API base URL: `NEXT_PUBLIC_API_URL` (default: `http://localhost:4000/api/v1`)
- Node.js: 22+
- Next.js: 16.4.6

`NEXT_PUBLIC_*` variables are compiled into browser JavaScript. They must contain only public configuration, never credentials or signing secrets.

## Commands

From the monorepo root:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

Workspace-specific commands:

```bash
npm run dev --workspace @privaops/web
npm run build --workspace @privaops/web
npm run start --workspace @privaops/web
```

## Migration boundary and next engineering phase

This is a framework migration, not a claim that every interactive view has already been redesigned as a separate route or converted to Server Components. The current workspace remains a client component because it depends on browser session state, event handlers, and interactive forms.

Recommended follow-up work:

1. Split the current large workspace component into feature-level components and hooks.
2. Introduce route segments for inventory, processing, privacy requests, audit activity, and security settings.
3. Move safe read-only data loading to Server Components or server-only service modules where the authentication model permits it.
4. Keep sensitive mutations behind the existing authenticated API until a deliberate backend consolidation is designed.
5. Add Playwright end-to-end coverage for login, refresh-cookie behavior, MFA, tenant isolation, and request lifecycle transitions.

## Deployment

For Vercel, set the project root to the repository root, use the Next.js framework preset, install with `npm install`, and build with `npm run build --workspace @privaops/web`. Do not configure a static output directory. Set `NEXT_PUBLIC_API_URL` to the public API base URL before the build.

The Express API deployment remains unchanged. Update its `WEB_ORIGIN` to the exact deployed web origin and validate refresh-cookie behavior over HTTPS.


## Feature route decomposition

Primary workspace areas now have deep-linkable App Router paths: `/`, `/inventory`, `/processing`, `/requests`, `/activity`, and `/security`. The shared client workspace synchronizes active navigation with the current pathname. See [APP_ROUTER_ROUTES.md](./APP_ROUTER_ROUTES.md) for the route map and authorization boundary.
