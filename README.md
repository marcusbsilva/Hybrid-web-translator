# Hybrid-web-translator

A low-CPU Chrome extension that translates **Chinese and Vietnamese web pages into English while preserving the original DOM and page interactivity**.

Hybrid-web-translator was created for pages where full-page machine translation can interfere with layout, controls, event handlers, or dynamically rendered content. Instead of replacing page HTML, the extension translates text nodes and a small set of safe text attributes in place.

Version **2.6** uses a hybrid architecture: the fast local dictionary/segmentation engine always runs first. For unresolved or low-confidence text, you can optionally use **Lingva (free, no API key)** or **Google Cloud Translation**. Successful fallback translations are learned locally and reused on later visits, reducing future network/API usage.

### Hybrid mode settings

![Hybrid-web-translator hybrid mode settings](docs/images/hybrid-settings-v3.3.png)

The popup controls local translation, the hybrid provider, the daily fallback budget, and the learned dictionary. **Lingva requires no API key**; a key is required only when Google Cloud is selected. Public Lingva instances can be rate-limited or unavailable, so self-hosting is recommended when reliability matters.

## Features

- Chinese (Simplified/Traditional-oriented lexicon) → English
- Vietnamese → English
- Local-first translation with no network requirement for known text
- Optional **Lingva fallback with no API key**
- Optional Google Cloud Translation Basic fallback
- Persistent learned translation dictionary
- Batches fallback requests to reduce API usage
- Configurable daily fallback character budget
- Exact translation cache and request deduplication
- Chinese phrase matching with DAG / frequency-based dynamic-programming segmentation
- Domain vocabulary for games, forums, source-code communities, software and server administration
- Vietnamese phrase-first matching
- Preserves existing DOM elements and JavaScript event handlers
- Supports dynamically inserted content through `MutationObserver`
- Uses idle/batched DOM processing to reduce main-thread spikes
- Can translate selected safe attributes such as `title`, `placeholder`, and `aria-label`
- Learned dictionary export for later curation or bundling

## Why this approach?

Conventional page translators may rebuild or wrap page content. On older forums, game-resource sites, SPAs, and heavily scripted pages, this can occasionally make controls difficult to use or alter the layout.

Hybrid-web-translator follows a narrower strategy:

```text
Page DOM
   │
   ├─ Text nodes / safe text attributes
   │
   ├─ Local exact dictionary
   │
   ├─ Local phrase/domain dictionary
   │
   ├─ Chinese DAG + frequency-based segmentation
   │      or Vietnamese phrase matching
   │
   ├─ Local English reconstruction / spacing cleanup
   │
   └─ Optional low-confidence fallback
          │
          ├─ Lingva (free / no API key)
          └─ Google Cloud Translation (optional API key)
                 │
                 └─ learned locally for future reuse
```

The extension does **not** replace `innerHTML` during normal translation. Scripts, styles, code blocks, editable areas, SVG, canvas, and other unsafe/non-text regions are skipped.

## Installation

### Load unpacked

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository directory containing `manifest.json`.
6. Browse to a Chinese or Vietnamese page.

The local translator works without an API key.

## Optional hybrid translation

Hybrid fallback is **disabled by default**. The extension offers two providers:

### Lingva — free / no API key

Select **Lingva** in the popup and enable **Hybrid learning fallback**. The default configuration uses a public Lingva instance. Lingva exposes a REST API and can also be self-hosted. Public community instances may impose rate limits, change domains, or become unavailable; for dependable use, configure your own HTTPS Lingva instance.

### Google Cloud Translation

Select **Google Cloud Translation**, enter your Cloud Translation Basic API key, enable hybrid fallback, and save. Google Cloud billing/activation requirements are controlled by Google. Do **not** commit an API key to this repository or distribute an unrestricted key in a packaged extension.

The hybrid engine only queues text that the local engine considers unresolved or low-confidence. Unique strings are deduplicated, requests are batched, and successful translations are stored in `chrome.storage.local`. Chrome documents `chrome.storage` as extension-specific persistent storage; this project requests `unlimitedStorage` so the learned dictionary can grow beyond the normal local-storage quota.

## Translation pipeline

### Chinese

The local Chinese engine uses:

1. Exact learned translations
2. Exact bundled phrases
3. Domain-specific phrases
4. Prefix-index candidate generation
5. A DAG of possible tokenizations
6. Frequency-weighted dynamic programming to choose a segmentation
7. Local dictionary lookup
8. English reconstruction and spacing cleanup

This design is inspired by the general segmentation strategy documented by **Jieba**, which uses a prefix dictionary, DAG generation, word frequencies and dynamic programming for maximum-probability segmentation. Hybrid-web-translator contains its own JavaScript implementation rather than embedding Jieba itself.

### Vietnamese

Vietnamese translation prioritizes longer phrases before individual terms. This is important because Vietnamese lexical units may consist of multiple space-separated syllables.

### Hybrid learning

When enabled, the fallback works as a teacher for the local engine:

```text
Unknown / low-confidence source text
              │
              ▼
   Selected fallback translation
              │
              ▼
    chrome.storage.local
              │
              ▼
Exact local hit next time
```

Use **Export learned dictionary** from the popup to export learned pairs as JSON for review or future integration into the bundled dictionaries.

## Project structure

```text
hybrid-web-translator/
├── manifest.json
├── content.js
├── service_worker.js
├── popup.html
├── popup.js
├── dictionaries/
│   ├── zh.js
│   └── vi.js
├── tools/
│   └── build_dictionary.py
├── README.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
└── .gitignore
```

## Building a larger Chinese dictionary

`tools/build_dictionary.py` can preprocess a CC-CEDICT text dump into a compact JavaScript dictionary overlay.

```bash
python tools/build_dictionary.py cedict.txt dictionaries/cedict.generated.js 60000
```

The generated file is **data derived from CC-CEDICT** and therefore must retain the applicable CC-CEDICT attribution and CC BY-SA 4.0 terms. See `THIRD_PARTY_NOTICES.md` before distributing generated dictionary data.

The script intentionally filters some variants/noise and prefers concise English glosses to keep browser lookup practical.

## Performance design

The project intentionally avoids running a local neural translation model continuously. Its hot path is mostly string scanning, indexed dictionary lookup, caching, and DOM text replacement.

Performance measures include:

- Prefix-indexed phrase candidates instead of scanning the entire dictionary
- Translation cache
- Learned exact-match cache
- Deduplicated fallback queue
- Deduplicated fallback requests
- Incremental `MutationObserver` processing
- `requestIdleCallback`/batched initial traversal where available
- No periodic full-page rescans
- No translation work for blocked elements
- Local-first translation before any network fallback

## Privacy

With hybrid fallback disabled, translation is local to the browser.

When hybrid fallback is enabled, unresolved/low-confidence text selected by the extension is sent to the configured Google Cloud Translation endpoint. Do not enable the fallback on pages containing sensitive information unless that behavior is acceptable for your use case and Google Cloud configuration.

The Google API key and learned translations are stored locally through Chrome extension storage. Review `service_worker.js` and `content.js` before deployment if you need stricter data-handling requirements.

## Permissions

The current manifest requests:

- `storage` — settings, cache and learned translations
- `unlimitedStorage` — allows the learned dictionary to grow beyond the standard `storage.local` quota
- `activeTab` — popup interaction with the current page
- `downloads` — export of the learned dictionary
- `<all_urls>` — content-script translation on arbitrary pages
- `https://translation.googleapis.com/*` — optional hybrid fallback

For a public Chrome Web Store release, consider narrowing host access or moving broad site access to optional host permissions if that fits your distribution model.

## Credits and references

Hybrid-web-translator's implementation was informed by the following projects, datasets and documentation. Unless explicitly stated, they are **references/inspirations and are not vendored dependencies** in this repository.

- **CC-CEDICT** — community-maintained Chinese–English dictionary. The dictionary data is distributed under **CC BY-SA 4.0**. The included build tool can generate an optional dictionary from CC-CEDICT data.
- **Jieba (`fxsjy/jieba`)** — reference for efficient Chinese segmentation concepts: prefix dictionary, DAG construction, word-frequency scoring, dynamic programming, and custom dictionaries. Jieba is MIT-licensed. This project uses an independently written JavaScript implementation of those general ideas.
- **jieba-tw** — useful reference for Traditional Chinese segmentation and Jieba's MIT licensing lineage.
- **open-vn-en-dict (`samuraitruong/open-vn-en-dict`)** — reference for Vietnamese/English dictionary resources and dictionary organization. The repository is MIT-licensed. Its README identifies upstream dictionary sources; verify upstream data rights before redistributing imported data.
- **Chrome Extensions / Manifest V3 documentation** — reference for content scripts, permissions, `chrome.storage`, service workers, and extension architecture.
- **Google Cloud Translation** — optional network fallback used only when explicitly enabled by the user.

See `THIRD_PARTY_NOTICES.md` for licensing details and redistribution notes.

## License

The **software source code written for Hybrid-web-translator** is licensed under the MIT License. See `LICENSE`.

Dictionary datasets can have separate licenses. In particular, any dictionary generated from CC-CEDICT remains subject to **CC BY-SA 4.0** and is not relicensed under MIT merely by being distributed with this project. See `THIRD_PARTY_NOTICES.md`.


## Extension interface

Hybrid-web-translator uses a compact popup designed to keep the local translator and optional hybrid learning controls easy to understand.


The main controls are:

- **Translation** — enables or disables page translation.
- **Hybrid learning fallback** — enables external fallback only when the local dictionaries cannot confidently resolve a text.
- **Fallback provider** — selects the translation service used for unresolved text. Lingva can be used without an API key; other configured providers can be selected when available.
- **Lingva instance** — allows the community/self-hosted Lingva endpoint to be changed without modifying the extension source.
- **Daily fallback character budget** — limits how much unresolved text may be sent to the selected fallback provider each day.
- **Export learned dictionary** — exports translations learned through hybrid mode so they can be reviewed and permanently merged into the language dictionaries.

All settings are **saved automatically** when changed. There is no separate Save button.

## Translator status

The status panel presents the most useful runtime information separately instead of combining everything into one status line.

![Hybrid-web-translator translator status](docs/images/translator-status-v3.3.png)

It reports:

- whether **Hybrid Learning** is ON or OFF;
- the currently selected **fallback provider**;
- the number of **learned translations**;
- the current **local translation cache** size;
- how many fallback characters were used **today**;
- the number of entries in the **Chinese dictionary**;
- the number of entries in the **Vietnamese dictionary**.

Local dictionaries are always attempted first. Hybrid mode sends only unresolved or low-confidence unique text to the selected provider and stores successful translations locally, reducing repeated external requests.

## Language-based dictionaries

The earlier website-specific/module split was removed. The current design uses exactly one maintained translation dictionary per source language; `registry.js` only initializes the language dictionary objects and is not a vocabulary module.

Dictionary maintenance is independent from the translation engine and is organized strictly by language:

```text
dictionaries/
├── registry.js
├── zh.js
└── vi.js
```

There are no website-specific dictionaries. Vocabulary collected from supported public web pages is merged into the appropriate language dictionary.

This means a Chinese translation learned from one website is available on every website where the same text appears.

The current bundled dictionaries contain over **1,000 Chinese entries** and over **350 Vietnamese entries**. They include common web interface terminology as well as vocabulary frequently encountered in forums, game-development communities, asset libraries, source-code pages, comments, download pages, Unity/Unreal content, 2D assets, AI tools, and related interfaces.

## Local-first hybrid learning

The translation pipeline is designed to minimize network use:

```text
Page text
   ↓
Language detection
   ↓
Local language dictionary
   ↓
DAG / Viterbi segmentation
   ↓
Local / learned cache
   ↓
Resolved? ── Yes → Replace text locally
   │
   No
   ↓
Optional fallback provider
   ↓
Successful translation
   ↓
Learned dictionary (chrome.storage.local)
   ↓
Future occurrences are resolved locally
```

The fallback is therefore a learning mechanism rather than the primary translation engine. Repeated source text does not need to be sent to the provider again after a successful translation has been learned.

## Dynamic pages and comments

The content scanner supports both the initial DOM and dynamically inserted content. A `MutationObserver` watches for new or changed text nodes without continuously polling the page.

This allows translation to continue working with forum replies, comments, pagination/AJAX content, dynamically rendered sections, and many modern websites while keeping CPU usage substantially lower than repeated full-page rescanning.

The extension also handles mixed Chinese/English and Vietnamese/English strings and supports short forum comments that would otherwise be easy to miss.

## Corpus crawler

The repository includes the dictionary corpus crawler directly under `tools/`:

```text
tools/
├── corpus_crawler.py
├── crawl.bat
├── crawl.sh
├── requirements.txt
└── README.md
```

The crawler explores configured public pages, extracts Chinese and Vietnamese text, deduplicates it, preserves source/context information, and skips strings that are already present in the corresponding language dictionary.

Windows:

```bat
tools\crawl.bat --max-pages 5000 --delay 1.5
```

Linux:

```bash
bash tools/crawl.sh --max-pages 5000 --delay 1.5
```

For JavaScript-heavy websites, Playwright rendering can be enabled:

```bash
python -m pip install playwright
python -m playwright install chromium
```

```bash
bash tools/crawl.sh --render-js example.com --max-pages 5000 --delay 1.5
```

The crawler is a development tool only. It is not executed by the Chrome extension and Python is not required for normal extension use.

## Privacy and API keys

Local dictionary translation does not require an API key and does not need to send successfully resolved text to an external translation provider.

When hybrid mode is enabled, unresolved text may be sent to the provider selected by the user. Provider credentials, when required, are stored in `chrome.storage.local`. API keys must never be committed to the repository.

## Contributing

Contributions are welcome. Useful areas include:

- Better Chinese segmentation/frequency data
- Curated game/software/forum terminology
- Vietnamese phrase segmentation
- Spacing and punctuation reconstruction
- Lower-cost confidence scoring
- Safer site-specific DOM handling
- Tests for mixed Chinese/English technical text

When contributing dictionary data, include its source and license. Do not submit scraped proprietary dictionary data without redistribution rights.

## Disclaimer

Machine and dictionary-based translation can be inaccurate. Do not rely on this extension as the sole translation source for legal, medical, financial, safety-critical, or other high-stakes content.

## v3.3 — Auto-save settings & clearer status panel

Version 3.0 removes the manual Save and Clear learned controls. Every setting is persisted automatically and propagated to active content scripts. The popup status area is now presented as separate metrics for hybrid state, provider, learned entries, local cache, language dictionary sizes, fallback usage, and engine version.

## v2.8 — Multi-platform comments & fallback providers

Version 2.Content scripts also run in frames, allowing comments embedded in eligible frames to be translated without replacing page HTML.

The hybrid-learning toggle now applies immediately: changing it updates `chrome.storage.local` and notifies the active content script instead of waiting for a page reload. The provider list now supports Lingva, Google Cloud Translation, LibreTranslate (including self-hosted instances), and DeepL API. Successful fallback translations continue to be stored in the learned local dictionary.

## Corpus crawler

The dictionary corpus crawler is included in `tools/` and uses the same language-only dictionary structure as the extension.

```text
tools/
├── corpus_crawler.py
├── crawl.bat
├── requirements.txt
└── README.md
```

Install its dependencies:

```bash
python -m pip install -r tools/requirements.txt
```

On Windows, `tools\crawl.bat` automatically points the crawler at `dictionaries\zh.js` and `dictionaries\vi.js`:

```bat
tools\crawl.bat --max-pages 5000 --delay 1.5
```

For JavaScript-heavy sites, install Playwright separately and pass the renderer option:

```bash
python -m pip install playwright
python -m playwright install chromium
```

```bat
tools\crawl.bat --render-js example.com --max-pages 5000 --delay 1.5
```

Crawler output remains development data and is not used by the Chrome extension at runtime.
