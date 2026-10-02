# Contributing

Thank you for improving Hybrid-web-translator.

## Guidelines

1. Keep translation DOM-safe: do not replace whole-page `innerHTML`.
2. Prefer indexed/local operations over continuous polling or expensive inference.
3. Add tests/examples for mixed Chinese/English or Vietnamese/English strings when changing segmentation or spacing behavior.
4. Keep the Google fallback optional and local-first.
5. Never commit API keys or other credentials.
6. For dictionary contributions, document the source and license. Do not import proprietary dictionary data without redistribution rights.
7. If third-party code or data is added, update `THIRD_PARTY_NOTICES.md`.

## Dictionary entries

Prefer longer, domain-specific phrases when they materially improve natural English. Avoid adding context-specific translations for common words when they would make unrelated pages worse.

## Pull requests

Describe the problem, the affected language/domain, example input/output, and any performance impact.
