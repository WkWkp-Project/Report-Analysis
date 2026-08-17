# Report delivery

## Available now

- **Report library** stores reports under a Brand with a name and Period. Project/Campaign scope is optional. Submit/Publish creates numbered immutable revisions, while working changes remain a Draft.
- **Revision history** opens old published snapshots without recalculating or overwriting them; Archive is a soft delete.
- **Internal report link** stores only report scope in the URL: date range, Project, Period, and Campaign IDs. It never contains access tokens or credentials. Workspace users must authenticate before the API returns editable data.
- **Client report link** creates an immutable, read-only snapshot with a random capability token and a 30-day default expiry. The stored record contains only the SHA-256 hash of the token, not the usable token itself. The public payload removes provider account/campaign IDs, credentials, internal override notes, and editing controls.
- **CSV export** downloads the posts in the current Combined / Organic / Paid view with UTF-8 Thai support, exact values, Project and Period context, and spreadsheet-formula neutralization.
- **PDF export** uses the browser print dialog and a print-only report layout containing Overview, the included-campaign table, Ads vs Organic, an optional selected Post deep-dive, and human report elements.
- **Admin metric corrections** preserve manual provenance and recalculate dependent metrics such as CTR, CPM, ROAS, and ROI. Custom formula metrics allow arithmetic over the canonical metric fields.

## Current boundaries

- Snapshot creation currently accepts validated demo/scoped report data. Live Facebook/API and file-import snapshots should use the same endpoint only after their import-validation gate reports `analysis_ready`.
- A client link is view-only but is still a bearer capability: anyone who receives it can view that snapshot until expiry. Do not paste it into public channels.
- Revocation metadata is supported by the storage format; an admin revocation screen/API remains a production follow-up.
- Public responses use rate limiting and `no-store`; deploy behind HTTPS before sharing outside the local network.

The current file-backed store is sufficient for one local/NAS server process and survives restarts. SQLite is the next low-complexity upgrade for concurrent users; PostgreSQL is appropriate only when multiple workers or organizations require stronger concurrency and isolation.
