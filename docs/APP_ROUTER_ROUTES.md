# PrivaOps App Router route map

The Next.js App Router exposes one deep-linkable route per primary workspace area.

| URL | File | Workspace tab |
| --- | --- | --- |
| `/` | `apps/web/app/page.tsx` | Overview |
| `/inventory` | `apps/web/app/inventory/page.tsx` | Data inventory |
| `/processing` | `apps/web/app/processing/page.tsx` | Processing register |
| `/requests` | `apps/web/app/requests/page.tsx` | Privacy request queue |
| `/activity` | `apps/web/app/activity/page.tsx` | Audit activity |
| `/security` | `apps/web/app/security/page.tsx` | Security settings |

## Navigation behavior

The interactive workspace reads the active pathname with `usePathname()` and navigates with `useRouter().push()`. The pathname determines the active tab and page heading, while the existing workspace component continues to own authenticated session state and feature interactions.

## Security boundary

Route visibility is not an authorization boundary. The API remains responsible for verifying the authenticated user, active organization membership, tenant scope, and role permissions on every protected request. The audit view is shown only to owners and administrators, and its API endpoint must independently enforce the same rule.

## Current component boundary

These routes currently mount the shared workspace client boundary. This creates real deep links and URL-aware navigation without duplicating sensitive workflow logic. A later UI refactor can move each feature panel into its own route-level component and selectively adopt Server Components for read-only data fetching.
