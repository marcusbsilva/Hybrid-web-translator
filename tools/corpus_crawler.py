#!/usr/bin/env python3
"""
Hybrid-web-translator Corpus Crawler

Crawls public pages on the configured sites, follows same-site links, extracts
Chinese and Vietnamese text, deduplicates it, and writes corpora for later
dictionary building.

Designed for:
  - https://www.gamecbg.com/
  - https://clbgamesvn.forumvi.net/
  - https://www.aigei.com/
  - https://www.clbgamesvn.com/diendan/

Safety / etiquette:
  * obeys robots.txt by default
  * rate-limits requests
  * public pages only (no login/cookie bypass)
  * stays on explicitly allowed hosts
  * skips binaries, media, logout/delete/admin/action URLs
  * supports resume through SQLite
  * optional Playwright renderer for JS-heavy pages

Install:
    pip install aiohttp beautifulsoup4 lxml langid
Optional JS rendering:
    pip install playwright
    playwright install chromium

Examples:
    python corpus_crawler.py
    python corpus_crawler.py --max-pages 5000 --delay 1.5
    python corpus_crawler.py --render-js aigei.com --max-pages 1000
    python corpus_crawler.py --seed https://www.gamecbg.com/thread-450-1-5.html
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import re
import sqlite3
import sys
import time
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse, urlunparse, parse_qsl, urlencode
from urllib.robotparser import RobotFileParser

import aiohttp
from bs4 import BeautifulSoup

try:
    import langid
except ImportError:
    langid = None

USER_AGENT = "HybridWebTranslatorCorpusCrawler/1.2 (+dictionary research; respectful crawler)"

DEFAULT_SEEDS = [
    "https://www.gamecbg.com/",
    "https://clbgamesvn.forumvi.net/",
    "https://www.aigei.com/",
    "https://www.clbgamesvn.com/diendan/forum.php",
]

ALLOWED_HOSTS = {
    "gamecbg.com", "www.gamecbg.com",
    "clbgamesvn.forumvi.net",
    "aigei.com", "www.aigei.com",
    "clbgamesvn.com", "www.clbgamesvn.com",
}

# Common public forum/content routes worth prioritizing.
PRIORITY_HINTS = (
    "thread", "forum", "showthread", "forumdisplay", "viewthread",
    "topic", "post", "comment", "game", "asset", "source", "download",
    "diendan", "t-", "f-", "category", "list"
)

SKIP_EXTENSIONS = {
    ".jpg",".jpeg",".png",".gif",".webp",".svg",".ico",".mp3",".wav",".ogg",
    ".mp4",".webm",".avi",".mov",".zip",".rar",".7z",".tar",".gz",".exe",
    ".dll",".apk",".xapk",".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",
    ".css",".js",".woff",".woff2",".ttf",".otf"
}

SKIP_URL_WORDS = (
    "logout", "login", "register", "delete", "remove", "admin", "moderator",
    "report", "reply", "postreply", "newthread", "editpost", "sendmessage",
    "private.php", "member.php?action=", "attachment.php", "download.php"
)

TRACKING_KEYS = {
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "fbclid","gclid","ref","from"
}

HAN_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")
VI_DIACRITIC_RE = re.compile(
    r"[ăâđêôơưĂÂĐÊÔƠƯ"
    r"áàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệ"
    r"íìỉĩịóòỏõọốồổỗộớờởỡợ"
    r"úùủũụứừửữựýỳỷỹỵ"
    r"ÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆ"
    r"ÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢ"
    r"ÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ]"
)

BLOCK_TAGS = {
    "script","style","noscript","svg","canvas","template","iframe",
    "textarea","code","pre"
}

@dataclass
class Extracted:
    lang: str
    text: str
    url: str
    title: str
    context: str

def canonicalize(url: str) -> str:
    p = urlparse(url)
    scheme = "https" if p.scheme in ("http", "https") else p.scheme
    host = p.netloc.lower()
    path = re.sub(r"/{2,}", "/", p.path or "/")
    pairs = []
    for k, v in parse_qsl(p.query, keep_blank_values=True):
        if k.lower() in TRACKING_KEYS:
            continue
        # Session IDs create duplicate URLs on old forums.
        if k.lower() in {"s", "sid", "sessionid"} and len(v) >= 16:
            continue
        pairs.append((k, v))
    pairs.sort()
    return urlunparse((scheme, host, path, "", urlencode(pairs), ""))

def allowed_url(url: str) -> bool:
    p = urlparse(url)
    if p.scheme not in ("http", "https") or p.netloc.lower() not in ALLOWED_HOSTS:
        return False
    low = url.lower()
    if any(word in low for word in SKIP_URL_WORDS):
        return False
    suffix = Path(p.path.lower()).suffix
    if suffix in SKIP_EXTENSIONS:
        return False
    return True

def normalize_text(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[\t\r\f\v]+", " ", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def likely_vietnamese(text: str) -> bool:
    if VI_DIACRITIC_RE.search(text):
        return True
    if langid and len(text) >= 20:
        try:
            lang, score = langid.classify(text)
            return lang == "vi"
        except Exception:
            pass
    return False

def split_candidate_text(text: str) -> Iterable[tuple[str, str]]:
    """Yield (language, segment). Mixed technical text is preserved as a whole
    when it contains the target language so later dictionary work keeps context."""
    text = normalize_text(text)
    if len(text) < 2:
        return
    if HAN_RE.search(text):
        yield "zh", text
    elif likely_vietnamese(text):
        yield "vi", text

def page_context(node) -> str:
    # Useful for separating comments/posts from navigation/UI.
    cur = getattr(node, "parent", None)
    for _ in range(5):
        if not cur:
            break
        attrs = " ".join([
            str(cur.get("id", "")),
            " ".join(cur.get("class", []) if isinstance(cur.get("class", []), list) else [])
        ]).lower()
        if any(x in attrs for x in ("comment","reply","post","message","thread","t_f","postmessage")):
            return "post/comment"
        cur = cur.parent
    return "page"

def extract_text(html: str, url: str) -> tuple[list[Extracted], list[str]]:
    soup = BeautifulSoup(html, "lxml")
    title = normalize_text(soup.title.get_text(" ", strip=True)) if soup.title else ""
    for tag in soup.find_all(BLOCK_TAGS):
        tag.decompose()

    rows: list[Extracted] = []
    seen_page = set()

    for node in soup.find_all(string=True):
        text = normalize_text(str(node))
        if not text or len(text) > 12000:
            continue
        for lang, segment in split_candidate_text(text):
            key = (lang, segment)
            if key in seen_page:
                continue
            seen_page.add(key)
            rows.append(Extracted(lang, segment, url, title, page_context(node)))

    # Include translatable UI attributes.
    for tag in soup.find_all(True):
        for attr in ("title", "placeholder", "aria-label", "value"):
            val = tag.get(attr)
            if not isinstance(val, str):
                continue
            val = normalize_text(val)
            for lang, segment in split_candidate_text(val):
                key = (lang, segment)
                if key not in seen_page:
                    seen_page.add(key)
                    rows.append(Extracted(lang, segment, url, title, "attribute"))

    links = []
    for a in soup.find_all("a", href=True):
        href = canonicalize(urljoin(url, a["href"]))
        if allowed_url(href):
            links.append(href)
    return rows, links


JS_KEY_RE = re.compile(r'(?:"((?:\\.|[^"\\])*)"|\'((?:\\.|[^\'\\])*)\')\s*:')

def load_dictionary_keys(paths: list[str]) -> set[str]:
    """Read source keys from modular JS dictionaries and return normalized strings.
    This intentionally reads keys only; translations are irrelevant to corpus filtering."""
    known: set[str] = set()
    files: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            files.extend(sorted(p.rglob("*.js")))
        elif p.is_file():
            files.append(p)
    for file in files:
        try:
            src = file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for m in JS_KEY_RE.finditer(src):
            raw_key = m.group(1) if m.group(1) is not None else m.group(2)
            try:
                # Decode ordinary JS/JSON escapes without corrupting Unicode literals.
                key = bytes(raw_key, "utf-8").decode("unicode_escape") if "\\u" in raw_key else raw_key
                key = key.replace(r"\"", '"').replace(r"\'", "'").replace(r"\\", "\\")
            except Exception:
                key = raw_key
            key = normalize_text(key)
            if key:
                known.add(key.casefold())
    return known

class Store:
    def __init__(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        self.root = root
        self.db = sqlite3.connect(root / "crawl.sqlite3")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS pages(
              url TEXT PRIMARY KEY, status INTEGER, fetched_at INTEGER,
              content_hash TEXT, error TEXT
            )""")
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS corpus(
              lang TEXT, text TEXT, url TEXT, title TEXT, context TEXT,
              text_hash TEXT,
              UNIQUE(lang, text_hash, url)
            )""")
        self.db.execute("CREATE INDEX IF NOT EXISTS idx_corpus_lang_hash ON corpus(lang,text_hash)")
        self.db.commit()

    def visited(self, url: str) -> bool:
        return self.db.execute("SELECT 1 FROM pages WHERE url=?", (url,)).fetchone() is not None

    def save_page(self, url, status, body="", error=None):
        h = hashlib.sha256(body.encode("utf-8", "ignore")).hexdigest() if body else None
        self.db.execute(
            "INSERT OR REPLACE INTO pages VALUES(?,?,?,?,?)",
            (url, status, int(time.time()), h, error)
        )
        self.db.commit()

    def save_rows(self, rows: list[Extracted]):
        vals = []
        for r in rows:
            h = hashlib.sha256(r.text.encode("utf-8")).hexdigest()
            vals.append((r.lang, r.text, r.url, r.title, r.context, h))
        self.db.executemany(
            "INSERT OR IGNORE INTO corpus(lang,text,url,title,context,text_hash) VALUES(?,?,?,?,?,?)",
            vals
        )
        self.db.commit()

    def export(self):
        for lang in ("zh", "vi"):
            rows = self.db.execute(
                """SELECT text, MIN(url), MIN(title), MIN(context), COUNT(DISTINCT url)
                   FROM corpus WHERE lang=? GROUP BY text_hash
                   ORDER BY COUNT(DISTINCT url) DESC, LENGTH(text) DESC""", (lang,)
            ).fetchall()
            with (self.root / f"{lang}_corpus.tsv").open("w", encoding="utf-8", newline="") as f:
                w = csv.writer(f, delimiter="\t")
                w.writerow(["text","example_url","page_title","context","page_count"])
                w.writerows(rows)
            with (self.root / f"{lang}_unique.txt").open("w", encoding="utf-8") as f:
                for text, *_ in rows:
                    f.write(text.replace("\n", " ") + "\n")

        stats = dict(self.db.execute("SELECT lang, COUNT(DISTINCT text_hash) FROM corpus GROUP BY lang"))
        stats["pages"] = self.db.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
        (self.root / "stats.json").write_text(
            json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
        )

class Robots:
    def __init__(self, session):
        self.session = session
        self.cache = {}

    async def allowed(self, url):
        p = urlparse(url)
        origin = f"{p.scheme}://{p.netloc}"
        if origin not in self.cache:
            rp = RobotFileParser()
            robots_url = origin + "/robots.txt"
            try:
                async with self.session.get(robots_url, timeout=15) as r:
                    txt = await r.text(errors="ignore") if r.status < 500 else ""
                rp.set_url(robots_url)
                rp.parse(txt.splitlines())
            except Exception:
                # Conservative default when robots cannot be fetched.
                rp.parse(["User-agent: *", "Disallow: /"])
            self.cache[origin] = rp
        return self.cache[origin].can_fetch(USER_AGENT, url)

async def fetch_static(session, url):
    async with session.get(url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=30)) as r:
        ctype = r.headers.get("content-type", "")
        if "text/html" not in ctype and "application/xhtml+xml" not in ctype:
            return r.status, "", str(r.url)
        text = await r.text(errors="replace")
        return r.status, text, str(r.url)

async def fetch_playwright(url):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(user_agent=USER_AGENT)
        await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        html = await page.content()
        final = page.url
        await browser.close()
        return 200, html, final

def priority(url: str) -> int:
    low = url.lower()
    return 0 if any(h in low for h in PRIORITY_HINTS) else 1

async def crawl(args):
    store = Store(Path(args.output))
    known_zh = load_dictionary_keys(args.zh_dictionary)
    known_vi = load_dictionary_keys(args.vi_dictionary)
    # Backward-compatible generic dictionaries are checked for both languages.
    known_generic = load_dictionary_keys(args.dictionary)
    known_zh |= known_generic
    known_vi |= known_generic
    if known_zh or known_vi:
        print(f"[dictionary] Chinese known: {len(known_zh):,} | Vietnamese known: {len(known_vi):,}")
    queue = deque(canonicalize(x) for x in (args.seed or DEFAULT_SEEDS))
    queued = set(queue)
    pages = 0
    last_by_host = {}

    headers = {"User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9,vi;q=0.8,en;q=0.5"}
    connector = aiohttp.TCPConnector(limit=args.concurrency, limit_per_host=1)

    async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
        robots = Robots(session)

        while queue and pages < args.max_pages:
            url = queue.popleft()
            if store.visited(url) or not allowed_url(url):
                continue

            if not args.ignore_robots and not await robots.allowed(url):
                store.save_page(url, 0, error="robots.txt disallowed")
                continue

            host = urlparse(url).netloc
            wait = args.delay - (time.monotonic() - last_by_host.get(host, 0))
            if wait > 0:
                await asyncio.sleep(wait)

            try:
                use_js = any(h in host for h in args.render_js)
                if use_js:
                    status, html, final = await fetch_playwright(url)
                else:
                    status, html, final = await fetch_static(session, url)
                last_by_host[host] = time.monotonic()

                final = canonicalize(final)
                if not allowed_url(final):
                    store.save_page(url, status, error="redirected outside allowed hosts")
                    continue

                store.save_page(url, status, html)
                pages += 1
                if status != 200 or not html:
                    print(f"[{pages}] HTTP {status}: {url}")
                    continue

                rows, links = extract_text(html, final)
                before = len(rows)
                rows = [
                    r for r in rows
                    if normalize_text(r.text).casefold()
                    not in (known_zh if r.lang == "zh" else known_vi)
                ]
                skipped_known = before - len(rows)
                store.save_rows(rows)
                zhc = sum(r.lang == "zh" for r in rows)
                vic = sum(r.lang == "vi" for r in rows)
                print(f"[{pages}/{args.max_pages}] zh={zhc:3} vi={vic:3} known-skip={skipped_known:3} links={len(links):4} {final}")

                # Put content-like routes first without excluding other public sections.
                new_links = [x for x in set(links) if x not in queued and not store.visited(x)]
                new_links.sort(key=priority)
                for link in reversed(new_links):
                    queue.appendleft(link)
                    queued.add(link)

            except KeyboardInterrupt:
                break
            except Exception as e:
                store.save_page(url, -1, error=repr(e))
                print(f"[ERROR] {url}: {e}", file=sys.stderr)

            if pages % 25 == 0:
                store.export()

    store.export()
    print(f"\nFinished. Output: {Path(args.output).resolve()}")
    print("Files: crawl.sqlite3, zh_corpus.tsv, vi_corpus.tsv, zh_unique.txt, vi_unique.txt, stats.json")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", action="append", help="Additional/alternate starting URL; repeatable")
    ap.add_argument("--output", default="corpus_output")
    ap.add_argument("--max-pages", type=int, default=2000)
    ap.add_argument("--delay", type=float, default=1.25, help="Minimum seconds between requests to one host")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--render-js", action="append", default=[],
                    help="Host substring to render with Playwright, e.g. aigei.com; repeatable")
    ap.add_argument("--zh-dictionary", action="append", default=[],
                    help="Chinese JS dictionary file/directory; known Chinese source strings are skipped")
    ap.add_argument("--vi-dictionary", action="append", default=[],
                    help="Vietnamese JS dictionary file/directory; known Vietnamese source strings are skipped")
    ap.add_argument("--dictionary", action="append", default=[],
                    help="Backward-compatible generic dictionary file/directory; checked for both languages")
    ap.add_argument("--ignore-robots", action="store_true",
                    help="Ignore robots.txt (not recommended; use only with permission)")
    args = ap.parse_args()
    asyncio.run(crawl(args))

if __name__ == "__main__":
    main()
