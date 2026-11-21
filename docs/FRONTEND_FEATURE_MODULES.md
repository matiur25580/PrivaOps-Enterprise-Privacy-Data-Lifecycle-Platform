# Frontend Feature Module Architecture

## Objective

Keep the browser workspace cohesive while moving stable domain contracts, transport behavior, formatting, and feature-specific UI into explicit modules. This is an incremental refactor: authentication and tenant-scoped API behavior remain unchanged.

## Current structure

```text
apps/web/src/
├── App.tsx                         # Workspace composition and cross-feature orchestration
├── lib/
│   ├── api-client.ts               # Credentialed API transport, refresh and one-time retry
│   ├── csv.ts                      # CSV export utility
│   └── format.ts                   # Shared display formatting
└── features/
    ├── auth/types.ts               # User, organization and session contracts
    ├── audit/types.ts              # Audit event contract
    ├── inventory/types.ts          # Data asset contract
    ├── organization/types.ts       # Organization member contract
    ├── processing/types.ts         # Processing activity contract
    ├── requests/
    │   ├── types.ts                # Request, event and workflow update contracts
    │   ├── domain.ts               # Allowed transitions and terminal states
    │   ├── domain.test.ts          # Workflow domain unit tests
    │   └── RequestDetailModal.tsx  # Request timeline and authorized workflow UI
    └── security/types.ts           # MFA setup contract
```

## Module responsibilities

- **API client:** owns the API base URL, in-memory access token, shared refresh promise, cookie credentials, JSON parsing, and one refresh/retry for expired non-auth requests.
- **Feature contracts:** define the data shapes consumed by each workspace domain without coupling those shapes to JSX.
- **Inventory feature:** owns its filter controls, asset form, archive confirmation, table rendering, and API operations. The workspace supplies the organization session and refresh/error/notice callbacks.
- **Processing feature:** owns its activity form, linked-active-asset selection, table rendering, and create API operation. The workspace supplies the session and shared asset collection.
- **Request domain:** is the single frontend source for terminal states and permitted next-state options. The backend remains authoritative and validates every transition.
- **Request detail component:** owns the request detail and timeline presentation; the parent passes data, state setters, and save/close callbacks.
- **Shared utilities:** keep CSV serialization and date/label formatting out of the workspace component.

## Security and tenancy invariants

1. Moving code into frontend modules does not grant authorization.
2. The API must continue to authenticate the user and derive organization scope from active membership.
3. Every protected endpoint must independently enforce role permissions and tenant filters.
4. The in-memory access token is not persisted in browser storage.
5. The client refresh path continues to use HttpOnly cookie credentials and a single-flight promise to avoid concurrent refresh rotation.
6. UI transition options are convenience only; server-side request workflow validation remains authoritative.

## Next decomposition step

The workspace component still coordinates session bootstrapping, cross-feature data loading, and the remaining privacy-request and security flows. Inventory and processing presentation and write operations now live in their own feature modules. The next extraction should isolate session/workspace data loading, then the privacy-request queue. Keep each change behavior-preserving and covered by tests before adopting server-side data fetching.
