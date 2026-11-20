# Data inventory and processing activities

This module provides an organization-scoped register of data assets and processing activities.

## Data assets

- `GET /api/v1/organizations/:organizationId/data-assets?page=1&limit=20&q=&status=&classification=`
- `POST /api/v1/organizations/:organizationId/data-assets`
- `PATCH /api/v1/organizations/:organizationId/data-assets/:assetId`
- `DELETE /api/v1/organizations/:organizationId/data-assets/:assetId` (soft archive)

A data asset records its name, description, system, accountable team, classification, data categories, and data-subject categories.

## Processing activities

- `GET /api/v1/organizations/:organizationId/processing-activities?page=1&limit=20&q=&status=`
- `POST /api/v1/organizations/:organizationId/processing-activities`
- `PATCH /api/v1/organizations/:organizationId/processing-activities/:activityId`
- `DELETE /api/v1/organizations/:organizationId/processing-activities/:activityId` (soft archive)

A processing activity records its purpose, legal-basis classification, systems, categories, linked data assets, and optional retention period in days.

## Security invariants

- Every route authenticates the caller and checks the URL organization against the active server-resolved membership.
- Every database read, update, archive, and asset-reference validation scopes by `request.auth.organizationId`; request-body organization IDs are never accepted.
- Asset references are validated within the active organization before a processing activity is created or updated.
- Owners and admins can manage records; members and viewers have read-only access.
- List endpoints cap page size at 100 and escape search input before constructing regular expressions.
- Deletes are soft archives to preserve lifecycle context.
- Every successful create, update, and archive writes an append-only audit event containing the organization, actor, resource, action, and changed field names (never field values).
- Tenant-scope helpers are covered by tests for organization mismatch and attempts to override the server-derived organization filter.

The legal-basis field is an operational classification, not a legal conclusion. Teams must validate the applicable basis and retention requirements with qualified counsel.
