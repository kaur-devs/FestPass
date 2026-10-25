# ADR-0006: Short-lived JWT access tokens with rotating refresh tokens in cookies

- Status: Accepted
- Date: 2026-10-25

## Context

The API needs to know who is calling on every request. The web app renders some pages on the server and some in the browser, and the API runs on a different subdomain. Sessions must be revocable (sign out, password reset, stolen device), and a stolen credential should be useful for as short a time as possible.

## Options

1. **Server-side sessions only.** An opaque session ID in a cookie, looked up in the database on every request. Revocation is instant, but every request costs a database read.
2. **Long-lived JWT only.** No database read per request, but a stolen token works until it expires and cannot be revoked.
3. **Short-lived JWT access token plus a rotating refresh token.** The access token is verified without a database read; the refresh token is stored (hashed) and can be revoked.

Where to keep the tokens:

- **`localStorage`**: readable by any script on the page, so one XSS bug leaks the session.
- **httpOnly cookies**: not readable by JavaScript; sent automatically, which requires CSRF protection.

## Decision

Option 3, with both tokens in httpOnly cookies.

| Cookie         | Contents                                              | Lifetime                                     | Path    |
| -------------- | ----------------------------------------------------- | -------------------------------------------- | ------- |
| `fp_at`        | JWT (HS256): user ID, session ID                      | 15 minutes                                   | `/`     |
| `fp_rt`        | 256-bit random token; only its SHA-256 hash is stored | 7 days idle, never beyond the 30-day session | `/auth` |
| `fp_signed_in` | `1`, a hint for the web app's route guard             | Same as `fp_rt`                              | `/`     |

- Every refresh issues a new refresh token and marks the old one used. Presenting a used token again means it was copied, so the whole session is revoked.
- All cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- CSRF: `SameSite=Lax` stops cross-site POSTs from carrying the cookies, and the API also rejects state-changing requests whose `Origin` header is not the web app.

## Consequences

- No database read to authenticate a normal request.
- Signing out revokes the session immediately for refreshes, but an access token already issued stays valid for up to 15 minutes. This is the accepted trade-off; a revocation check against Redis can be added later if needed.
- Two browser tabs refreshing at the same instant would look like token reuse and sign the user out. The web client funnels all refreshes through one in-flight request to prevent this.
- The refresh cookie's `/auth` path means it is never sent with ordinary API requests, which limits where it can leak.
- Web and API must share a parent domain in production so the cookies reach both (`COOKIE_DOMAIN`).
