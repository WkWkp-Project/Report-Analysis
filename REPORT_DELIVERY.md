# Report delivery

## Available now

- **Internal report link** stores only report scope in the URL: date range, Project, Period, and Campaign IDs. It never contains access tokens or credentials. Production recipients must authenticate to the Workspace before the API returns data.
- **CSV export** downloads the posts in the current Combined / Organic / Paid view with UTF-8 Thai support, exact values, Project and Period context, and spreadsheet-formula neutralization.
- **PDF export** uses the browser print dialog and a print-only report layout containing Overview, Ads vs Organic, an optional selected Post deep-dive, and human report elements.

## Public client links (next delivery branch)

Public links should not point at the live authenticated analysis endpoint. Create an immutable report snapshot only after validation, then issue a random one-time-visible token. Store only its hash with `snapshot_id`, expiry, revocation time, and access policy. A public endpoint should return only the approved snapshot, use rate limits and no-store headers, and never expose provider IDs, credentials, raw imports, internal comments, or draft AI output unless explicitly included.

This feature needs persistent snapshot metadata. It should be implemented after the local data store decision so link expiry and revocation survive restarts. SQLite is sufficient for a single NAS/server; PostgreSQL is the upgrade path for multiple workers or organizations.
