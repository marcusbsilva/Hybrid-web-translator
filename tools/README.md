# Dictionary tools — external site configuration

Run these commands from the project root. Requires Python 3.10+.

```sh
python -m pip install -r tools/requirements.txt
python tools/corpus_crawler.py --max-pages 100
```

On Windows, launch `tools\crawl.bat` (double-click or run it from a terminal). On Linux, run `bash tools/crawl.sh`. Both launchers use **http://localhost:5000** automatically and immediately update the bundled dictionaries after each successful translation batch. LocalTranslator Studio must already be running; install the crawler dependencies before running them. Keep this `tools` directory in the project root alongside `dictionaries`.

The server URL is optional. To override it:

```bat
tools\crawl.bat --translate-url http://localhost:5001
```

For corpus collection without translation, use `tools\crawl.bat --no-translate` or `bash tools/crawl.sh --no-translate`. All existing crawler flags remain available. Changing crawler settings does not enable the extension's manual fallback switch.

The crawler respects robots.txt by default, spaces requests and restricts hosts. It collects public text, titles, attributes and links rather than downloading game files. New zh/vi/th/ru/pt/es/fr/ja phrases are translated using LocalTranslator Studio and recorded as JSONL. Editable modules are merged atomically after each successful API batch (the bundled `dictionaries` directory is the default; `--update-dictionaries` selects another directory and `--no-update-dictionaries` keeps logs only); failed requests are not stored as translations.

Edit `tools/sites.txt` to choose the public sites. Use one complete HTTP(S) URL per line; blank lines and `#` comment lines are ignored. The file is read at startup, with UTF-8/UTF-8 BOM support. Its path is resolved from the crawler location, so it also works when launched from another directory. Seed hosts and their bare/www aliases are allowed automatically; unrelated subdomains still require `--allow-host`. `--seed https://site.example/` overrides the text file. `--sites-file path/to/sites.txt` selects another list. Missing, empty or invalid lists produce a clear error. For JavaScript-rendered content, install `playwright`, run `playwright install chromium` and add `--render-js site.example`. Static mode fetches only the HTML response and never loads linked assets. The optional renderer reuses one browser for the run and blocks images, media, stylesheets, fonts, subframes and media URLs. It keeps scripts and data requests required to produce dynamic text. A bounded 500 ms settle replaces network-idle waiting; pages that load text later may need a future site-specific wait. Rendering does not remove login requirements or site restrictions.

`--translation-budget 50000` limits new request characters per run, including failures. It is independent of the extension's daily budget. Empty/unchanged translations, incompatible languages and source text above 1,200 characters are rejected. Each normalized phrase/language is attempted once per run. Bundled curated/general modules, `--update-dictionaries` modules and existing `--live-jsonl` translations are loaded automatically for known-key filtering. Known terms are exact word/phrase matches: a known word inside an otherwise unknown sentence does not cause that sentence to be discarded. Newly learned keys immediately join this filter, including across restart. Additional `--zh-dictionary` / `--vi-dictionary` / other language flags extend the automatic files. SQLite tracks already visited pages.

Use `--translation-batch-size 12` (default, range 1–30) to reduce API calls. Each successful response is merged and logged before the next request, even while processing a large page. Use `1` for immediate per-phrase writes. Unsupported/incomplete responses are reported and not learned. The connection limit does not parallelize page discovery; host delays still apply.

To update open extension pages without reloading:

```sh
python tools/export_learned.py corpus_output/learned.jsonl corpus_output/dictionaries.json
```

Use **Import JSON** in the popup. Editing a `.js` file on disk does not update an already loaded content script automatically.

The watcher can consume JSONL from other tools:

```sh
python tools/live_dictionary.py --input corpus_output/learned.jsonl --watch
```

Format: `{"lang":"zh","source":"新词","translation":"new word"}` per line. The watcher waits for complete lines and handles truncation. Do not run multiple writers against the same module simultaneously.

Refresh open reference datasets while preserving hand-edited domain modules:

```sh
python tools/update_dictionaries.py
python tools/update_dictionaries.py --lang ru --limit 30000 --max-bytes 200000000
```

Downloads are bounded. The 5.1.0 snapshot used complete source downloads followed by entry filtering; future imports stop at configurable entry/byte limits. Defaults are 2 million keys and 2 GB per source. `last-update.json` records source URL, date, downloaded volume and a hash of the prefix read. Preserve dataset licenses when redistributing.

Import previously downloaded files:

```sh
python tools/build_dictionary.py cedict.txt dictionaries/zh-general.js 160000
python tools/import_dictionary.py vietnamese.jsonl dictionaries/vi-general.js --lang vi
python tools/import_dictionary.py terms.tsv dictionaries/ru-general.js --lang ru --format tsv
```

TSV: source term, TAB, English translation. JSONL: Wiktextract/Kaikki format with `word`, `lang_code` and `senses[].glosses`. General modules load first; domain and custom terms override them. Domain modules expose `SPT_DOMAIN_*` for all eight source languages, allowing the engine to distinguish curated terms from reference glosses.

The engine intentionally filters unsafe general definitions during automatic matching. Large reference entry counts do not guarantee reliable context-sensitive translations. Import only translations you intend to trust as domain/custom entries.

The updater/importer support `--lang pt`, `es`, `fr` and `ja`; `pt` contains Portuguese reference vocabulary and Brazilian curated UI phrases. The crawler uses the nearest HTML `lang` hint and conservative language evidence, with optional `langid` for longer text. Add each new target site with `--allow-host`; no additional sites are crawled automatically. All crawler dictionary values remain English regardless of the popup destination.

## Verification

Run `python -m unittest discover -s tools/tests -v` from the project root. Tests cover default server selection, TXT parsing/BOM/comments/duplicates, host restrictions, CLI overrides, shell argument forwarding and live learning/deduplication against a local HTTP fixture. The Windows BAT was reviewed here; it was not executed on Windows.

## Rebuild local bilingual packs

```sh
python tools/update_dictionaries.py
python tools/fetch_bilingual_sources.py --cache dictionary-downloads
python tools/build_bilingual_packs.py --cache dictionary-downloads
```

The fetcher selects available pairs among the nine supported language codes from the FreeDict catalog, validates source SHA-512 checksums, and retains TEI aliases and credits. The builder combines these tables with short English reference glosses and CC-CEDICT simplified/traditional aliases, then writes destination packs, counts, provenance, credit headers and GPL source archives. Internet access and enough disk space for full datasets are required. Vietnamese/Thai mainly use conservative English pivots because direct tables are unavailable in this catalog. Preserve dataset licenses and source archives when distributing updates. Restart/reload the extension after changing packaged files. The crawler continues to learn English-valued domain phrases; it does not regenerate bilingual packs automatically.
