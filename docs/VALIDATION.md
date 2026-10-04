# Validation — Hybrid Web Translator 6.0.0

## Scope

This release refreshes the extension popup, replaces its local provider with LocalTranslator Studio, and removes the obsolete container distribution and generated output. The native Studio server is distributed separately.

## Functional checks

- Core dictionary matching, phrase/filename handling, conservative prose behavior, bilingual routing and GameCBG offline fixtures are covered by the existing Node suites.
- Worker suites cover Studio/Google/DeepL/Lingva routes, language-pair cache isolation, diagnostics, failed responses, pivot stages, learned entries and the manual fallback policy.
- Loopback Studio endpoints bypass daily quotas; remote endpoints still apply the configured budget.
- A new migration test preserves a previous valid server address, learned translations and manual fallback state while removing obsolete local-provider settings.
- Chromium tests exercise dynamic page translation, batch continuation, non-English destinations, immediate manual fallback changes and stale-response suppression using browser API/provider mocks.
- Popup checks cover default Detect language → English, Studio selection/address, provider switching, visible project links, local budget controls and English labels. Light/dark screenshots are in images/.

## Popup width correction

The popup now has an explicit 420 px HTML/body minimum width. A Chromium regression starts with a 240 px viewport and verifies that the layout remains 420 px; at the intended width it has no horizontal overflow. Text/select sizes were increased slightly. Existing content and popup browser checks passed again.

## Cleanup and packaging

- Removed the obsolete server folder and launchers, crawler databases/generated corpora, Python bytecode/cache folders and the duplicated dictionary ZIP.
- Preserved dictionary data, manifests, dataset credits and applicable corresponding source archives.
- JavaScript/Python/shell syntax, manifest file references, documentation links and ZIP integrity are checked before delivery.

## Limits

Chrome extension APIs and provider responses are represented by mocks. These checks do not establish live commercial/community provider availability, native server model quality or compatibility with every site. Dictionary counts are vocabulary totals, not guaranteed sentence coverage. The native server is not bundled or launched by this extension. Windows execution is not claimed.
