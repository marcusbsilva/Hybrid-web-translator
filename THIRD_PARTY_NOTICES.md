# Third-Party Notices

Hybrid-web-translator is MIT-licensed software, but external datasets and reference projects may have their own licenses.

## CC-CEDICT

**Project:** CC-CEDICT Chinese-English dictionary  
**Website:** https://cc-cedict.org/  
**License:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)  
**License:** https://creativecommons.org/licenses/by-sa/4.0/

`tools/build_dictionary.py` is able to transform a CC-CEDICT dump into a JavaScript dictionary. Any output containing adapted CC-CEDICT dictionary data remains subject to CC BY-SA 4.0. Preserve attribution, identify modifications where appropriate, provide the license, and comply with ShareAlike when redistributing that data.

The MIT license in the repository root applies to Hybrid-web-translator's original software code; it does not override CC-CEDICT's license for CC-CEDICT-derived data.

## Jieba

**Project:** fxsjy/jieba  
**Repository:** https://github.com/fxsjy/jieba  
**License:** MIT

Hybrid-web-translator's Chinese segmenter is independently implemented in JavaScript, but its architecture is informed by publicly documented Jieba concepts including prefix dictionaries, DAG candidate generation, word-frequency scoring, dynamic programming, and custom dictionary support.

No Jieba Python source code is required at runtime by this extension.

## jieba-tw

**Project:** TIGCR/jieba-tw  
**Repository:** https://github.com/TIGCR/jieba-tw  
**License:** MIT

Referenced while researching Traditional Chinese segmentation and Jieba-compatible dictionary approaches.

## open-vn-en-dict

**Project:** samuraitruong/open-vn-en-dict  
**Repository:** https://github.com/samuraitruong/open-vn-en-dict  
**Repository license:** MIT

Used as a reference while researching Vietnamese-English dictionary resources and data organization. The project's README identifies external dictionary sources. If importing or redistributing its dictionary content, verify the rights and terms applicable to the underlying data sources rather than assuming the repository's software license automatically covers every upstream dictionary entry.

The bundled `dictionaries/vi.js` in this repository is a compact project-specific lexicon and is not presented as a vendored copy of that repository.

## Google Cloud Translation

**Service:** Google Cloud Translation  
**Documentation:** https://cloud.google.com/translate/docs

Google Cloud Translation is an optional external service. It is not bundled with this project. Users provide their own credentials and are responsible for their Google Cloud account, API configuration, quotas, pricing, terms, and data-handling requirements.

## Google Chrome Extensions documentation

**Documentation:** https://developer.chrome.com/docs/extensions/

Chrome Extensions / Manifest V3 documentation was used as the platform reference for extension manifests, permissions, service workers, content scripts, and `chrome.storage`.

---

If you add a third-party dataset, model, library, generated dictionary, or substantial copied/adapted code, update this file and preserve the applicable copyright and license notices.


## Lingva Translate

Hybrid-web-translator can optionally call a user-configurable Lingva Translate instance as a no-key network fallback. Lingva Translate is an independent open-source project licensed under GNU AGPLv3. This project does not bundle or modify Lingva server code; it only interoperates with its documented HTTP API. Public Lingva instances are operated by third parties and may have their own availability, privacy, and usage policies.

## Additional optional translation providers (v2.8)

Hybrid-web-translator can interoperate over HTTP with user-selected translation services. No provider SDK code is bundled into the extension.

- DeepL API — optional external translation provider requiring the user's own API credentials.
- Google Cloud Translation — optional external provider requiring the user's own API credentials/billing configuration.
- Lingva Translate — optional community/self-hosted translation frontend with a public REST API; availability of public instances is not guaranteed.

Each external service remains subject to its own terms, privacy policy, quotas and licensing.

## Bundled reference datasets

### CC-CEDICT/MDBG

`dictionaries/zh-general.js` adapts the MDBG dump dated **2026-10-01T07:35:40Z**, downloaded from https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz. The source dump header specifies **CC BY-SA 4.0**, https://creativecommons.org/licenses/by-sa/4.0/. Attribution: CC-CEDICT contributors; original CEDICT, Copyright (C) 1997, 1998 Paul Andrew Denisowski.

Modifications: first short English gloss, removal of some named/variant/long glosses with simplified/traditional aliases retained, after reading the complete downloaded source. This adapted dataset remains CC BY-SA 4.0; the software MIT license does not replace it. The dump header governs this import rather than older wiki license descriptions.

### English Wiktionary through Kaikki/Wiktextract

The `vi`, `th`, `ru`, `pt`, `es`, `fr` and `ja` general modules are subsets contributed by **English Wiktionary contributors**, extracted/published by **Tatu Ylonen / Kaikki / Wiktextract**, fetched on 2026-10-03:

- https://kaikki.org/dictionary/Vietnamese/kaikki.org-dictionary-Vietnamese.jsonl
- https://kaikki.org/dictionary/Thai/kaikki.org-dictionary-Thai.jsonl
- https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl
- https://kaikki.org/dictionary/Portuguese/kaikki.org-dictionary-Portuguese.jsonl
- https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl
- https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl
- https://kaikki.org/dictionary/Japanese/kaikki.org-dictionary-Japanese.jsonl

Entry attribution and revision history: `https://en.wiktionary.org/wiki/TERM`, with the source key URL-encoded as TERM. Copyright information: https://en.wiktionary.org/wiki/Wiktionary:Copyrights and https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use. Wiktionary text is subject to CC BY-SA and, where applicable, GFDL; redistribute these adaptations under **CC BY-SA 4.0**, https://creativecommons.org/licenses/by-sa/4.0/. MIT does not apply to these derived datasets.

Modifications: selected source language only, first short English gloss, lowercased keys, exclusion of inflection/archaic/name senses and lexical quality filtering after full source downloads. Raw Wiktionary dumps are not included. Exact counts, download URLs, dates and module hashes are in `docs/dictionary-sources.json`. Portuguese reference data is not restricted to the Brazilian dialect; project-specific Brazilian UI wording is curated separately.

Method reference: Tatu Ylonen, *Wiktextract: Wiktionary as Machine-Readable Structured Data*, LREC 2022, pp. 1317–1325, https://aclanthology.org/2022.lrec-1.140/.

### Translation repositories and services studied

- https://github.com/matheuss/google-translate-api — MIT; language routing, encoding, segmented responses and error handling were studied. No token/safe-eval code is vendored.
- https://github.com/fazxid/node-google-translate — MIT; CLI/browser-scraping behavior studied. No Puppeteer or Google page scraper is included.
- https://github.com/zubairjammu786/googletranslateapi — unofficial Python client studied for segmented responses. No code was copied or unofficial endpoint promised as reliable.

Curated modules contain project-authored common interface/technical vocabulary. Aigei and CLBGAMESVN informed vocabulary needs; their posts, game files and images are not bundled. The source/target selector behavior is independently implemented; no Google Translate UI source/assets are included.

## FreeDict / WikDict bilingual dictionaries (5.1.0)

Catalog: https://freedict.org/freedict-database.json  
Downloads: https://freedict.org/downloads/  
WikDict: https://www.wikdict.com/  
Source project: https://github.com/freedict/fd-dictionaries

Twenty-seven published bilingual tables are adapted into `dictionaries/pairs/*.json`. Exact names, versions, download URLs, SHA-512 hashes, counts and license declarations are in `docs/bilingual-sources.json`. Original TEI header authors/copyright/availability statements are preserved in `third_party/freedict/*-credits.xml`.

Most selected WikDict/FreeDict tables are licensed **CC BY-SA 3.0 Unported**, https://creativecommons.org/licenses/by-sa/3.0/. Legacy English/French/Portuguese and Spanish tables carry **GNU GPL v2 or later** declarations; their complete corresponding downloaded source archives (including license texts) are included in `third_party/freedict/*.tar.xz`. Consult each manifest entry and archive for the applicable license and author list. Dataset adaptations retain those terms; the original software remains MIT.

Modifications: Unicode NFC/lowercase keys; all source orthographic aliases; first suitable target translation; script validation; exact Chinese simplified/traditional alias propagation; conservative English-gloss pivots/inverses; duplicate-key precedence; packing by destination. Inverted short English Wiktionary/CC-CEDICT glosses remain adaptations of their respective ShareAlike sources. A combined pack includes separately sourced tables; original source/license attribution is retained in the manifests and credit headers. No neural model or server implementation is bundled.

## GameCBG phrase review (5.1.1)

Project-authored translations of selected public interface labels, technical fields and descriptions for the six user-reported pages are recorded in `docs/gamecbg-curated-sources.json`, with source URLs and snapshot fingerprints. Game names without a verified English title use descriptive/pinyin display names. No site HTML, scripts, graphics, accounts, downloadable game assets or server code are bundled as part of this phrase review. Source descriptions are adapted into short English wording; preserve the source attribution manifest with dictionary redistributions.

## Optional local translation server

[LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio) is an independently installed local application. Its code, environment and model weights are not bundled in this extension; consult that repository for its own licenses and setup.
