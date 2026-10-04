# Lingva diagnosis — 2026-10-02

Real HTTP requests were made from this environment to `/api/v1/languages/source` and `/api/v1/zh/en/你好` with URL-encoded source text.

| Configured instance | Language list | Translation |
|---|---:|---:|
| translate.plausibility.cloud | 200 / language JSON | 500 / translation retrieval error |
| lingva.lunar.icu | 200 / language JSON | 500 / translation retrieval error |
| translate.projectsegfau.lt | 404 | 404 |
| translate.dr460nf1r3.org | 502 | 502 |
| lingva.garudalinux.org | 403 / access challenge | 403 / access challenge |
| translate.jae.fi | 502 | 502 |

Two additional instances listed by the project were tested: lingva.ml returned 403 and translate.igna.wtf returned 502. Neither was added automatically as a working replacement.

The request route matches the official Lingva API. Server code returns HTTP 500 when `getTranslationText` cannot retrieve a translation. The first two instances accepted the route but failed to obtain a translation. Without server logs, the specific upstream cause cannot be established.

Sources: https://github.com/theDavidDelta/lingva-translate/blob/main/README.md and https://github.com/theDavidDelta/lingva-translate/blob/main/pages/api/v1/%5B%5B...slug%5D%5D.ts .

## Extension fixes in 4.0.1 and retained in 4.0.2

- Diagnostics test every failover candidate rather than only the primary, with up to three concurrent translation probes.
- HTTP 200 JSON containing an error or no textual translation is rejected before counting success.
- Failed instances are excluded from the rest of a batch and paused temporarily.
- The saved working instance is tried immediately after the user's primary.
- A pasted `/api/v1/...` URL is normalized instead of duplicating the route.
- Diagnostic timeouts cover response-body reading.

`tests/lingva.test.cjs` uses simulated working/failing responses to verify the fixes. The table comes from separate live probes. These changes do not repair an unavailable public backend. Availability may change or differ between networks; use the diagnostic button on your own computer.
