# Contributing

Keep dictionaries separate from the engine. Preserve one entry per line in editable `dictionaries/{zh,vi,th,ru,pt,es,fr,ja}.js` modules. These modules expose `SPT_DOMAIN_*` namespaces and merge into `SPT_*`. Use `*-general.js` for bulk reference imports, with attribution and licenses. Local dictionary values are English. Other page destinations use exact curated cross-language matches, pair-scoped learned results or a provider. Keep general glossary definitions out of cross-language phrase matching. Keep language aliases and completeness checks in languages.js and corpus language support in tools/language_support.py.

Do not include API keys, private corpora or models in the ZIP. Run the relevant tests listed in README when changing matching, activation, restoration or learning. Chromium tests require Playwright and a Chromium executable.
