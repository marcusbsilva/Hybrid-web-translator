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
