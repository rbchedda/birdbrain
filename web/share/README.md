# Diary share viewer (ON HOLD)

Static stub for `feat/diary-share-link`. Served at `{EXPO_PUBLIC_SHARE_BASE_URL}/share/?t=<token>`.

**Public viewer is ON HOLD** (`public_diary_share_enabled()` / `EXPO_PUBLIC_FLAG_PUBLIC_DIARY_SHARE` default OFF). This page is prepared so hosting can flip the flag later.

## Legal / privacy constraints (do not relax)

- Send `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer` as **HTTP headers** as well as the meta tags in `index.html`.
- No third-party analytics, scripts, or tracking cookies. View counting is first-party only via `record_share_link_view`.
- No OG image that contains a map. Generic title only.
- Public payload is county + blurred point only. Hide bird totals. Coarsen dates. Location line: `≈ {County} County · area approximate`.
- Invalid / revoked / expired / flag-off all look the same ("isn't shared anymore").
- Report form posts to `report_shared_diary` (no email send from this page).

## Deploy (not done by this PR)

1. Copy `config.example.js` → `config.js` on the host.
2. Set `supabaseUrl` and the **anon** key only (never the service role).
3. Host `index.html` + `config.js` behind HTTPS with the headers above (`Cache-Control: max-age=60, private` recommended for revoke).
4. Apply migration `20261105000000_diary_share_links.sql` to hosted Supabase first (RBChedda approval; `/workspace/hosted-changes-needed.md`).

## Privacy-policy note (PR)

> We count views of your shared links and show you the total. We don't tell you who viewed them.
