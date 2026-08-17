# Direct Facebook connection

Facebook Login is a backend-owned connector, not a browser token field.

```text
React UI -> /api/facebook/oauth/start -> Meta consent
Meta -> /api/facebook/oauth/callback -> token exchange + account discovery
                                     -> encrypted APP_DATA_DIR/connections/facebook.enc
React UI <- safe status (user, Pages, Ad Accounts; never tokens)
```

## Local setup

1. Create a Meta Developer App and enable Facebook Login for Business / Marketing API.
2. Add the exact callback URL to **Valid OAuth Redirect URIs**. The local default is `http://localhost:8000/api/facebook/oauth/callback`.
3. Copy `.env.example` to `.env` and set `FB_APP_ID`, `FB_APP_SECRET`, and a stable `TOKEN_ENCRYPTION_KEY`.
4. Run the backend and frontend, open **Data sources**, then choose **เชื่อมต่อ Facebook**.

The connector requests read-only reporting scopes, discovers every accessible Page and Ad Account, and stores the resulting token encrypted under `APP_DATA_DIR`.

## Security and deployment

- OAuth state is signed and expires after 10 minutes.
- Graph calls include `appsecret_proof`; tokens are encrypted before persistent storage.
- Graph tokens travel in the Authorization header; pagination accepts only HTTPS URLs on `graph.facebook.com`.
- All connection status, start, refresh, disconnect, and callback operations require the signed workspace session.
- Production refuses to start without `APP_AUTH_PASSWORD` and `APP_SESSION_SECRET`; mutation endpoints also enforce origin checks and rate limits.
- `FB_GRAPH_API_VERSION` is configurable so API version upgrades do not require a code rewrite.
- For a single-origin production deployment, set `APP_BASE_URL`, `FRONTEND_URL`, and `FB_REDIRECT_URI` to the public HTTPS domain.
- Never put Meta tokens or the App Secret in frontend environment variables.
- The file store is the Level 1 single-workspace adapter. Managed multi-user production should replace only this adapter with database/KMS-backed storage.
- The current authentication model is one trusted workspace. It is suitable for a private single-team deployment behind HTTPS; a public multi-tenant service still requires per-user/per-workspace authorization and managed secret storage.

Excel/CSV remains a fallback source and enters the same scope, mapping, validation, and confirmation gates as API data.
