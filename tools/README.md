# Hybrid-web-translator Corpus Crawler v1.2

The crawler now follows the same maintenance model as the extension: **one dictionary per language**, not per website.

Recommended extension layout:

```text
dictionaries/
├── registry.js
├── zh.js
└── vi.js
```

Run:

```bash
python corpus_crawler.py \
  --zh-dictionary ./dictionaries/zh.js \
  --vi-dictionary ./dictionaries/vi.js \
  --render-js aigei.com \
  --max-pages 5000 \
  --delay 1.5
```

When a Chinese string already exists as a source key in `zh.js`, it is not added to `zh_corpus.tsv`.
When a Vietnamese string already exists in `vi.js`, it is not added to `vi_corpus.tsv`.

The crawler still visits the page and follows its links. Only already-known corpus text is skipped.

`--dictionary` remains available for backward compatibility, but `--zh-dictionary` and `--vi-dictionary` are preferred.
