#!/usr/bin/env python3
"""
Hybrid-web-translator Corpus Crawler

Crawls public pages on the configured sites, follows same-site links, extracts
text in eight supported source languages, deduplicates it, and writes corpora for later
dictionary building, with optional immediate batch learning.

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
  * optional reusable Playwright renderer with non-text resource blocking for JS-heavy pages

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
import unicodedata
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse, urlunparse, parse_qsl, urlencode
from urllib.robotparser import RobotFileParser

import aiohttp
from bs4 import BeautifulSoup, Comment
from language_support import LANGUAGES,detect

try:
    import langid
except ImportError:
    langid = None

USER_AGENT = "HybridWebTranslatorCorpusCrawler/1.3 (+dictionary research; respectful crawler)"

DEFAULT_SITES_FILE = Path(__file__).resolve().with_name("sites.txt")
DEFAULT_TRANSLATE_URL = "http://localhost:5000"
ALLOWED_HOSTS: set[str] = set()


def configured_sites(args):
    """Read one URL per line; explicit --seed values override the file."""
    seeds = args.seed
    if not seeds:
        path = Path(getattr(args, "sites_file", DEFAULT_SITES_FILE))
        if not path.is_file():
            raise ValueError(f"Sites file not found: {path}. Create it or use --seed.")
        seeds = [line.strip() for line in path.read_text(encoding="utf-8-sig").splitlines()
                 if line.strip() and not line.lstrip().startswith("#")]
    result = []
    for raw in seeds:
        parsed = urlparse(raw)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or any(c.isspace() for c in raw):
            raise ValueError(f"Invalid site URL: {raw!r}. Use a complete HTTP(S) URL, one per line.")
        try:
            parsed.port
        except ValueError as error:
            raise ValueError(f"Invalid site URL: {raw!r}") from error
        url = canonicalize(raw)
        if url not in result:
            result.append(url)
    if not result:
        raise ValueError("Sites file is empty. Add at least one HTTP(S) URL.")
    return result


def configure_hosts(seeds, extra):
    ALLOWED_HOSTS.clear()
    ALLOWED_HOSTS.update(host.lower() for host in extra)
    for seed in seeds:
        host = urlparse(seed).netloc.lower()
        ALLOWED_HOSTS.add(host)
        # Permit the common bare/www redirect without permitting unrelated subdomains.
        ALLOWED_HOSTS.add(host[4:] if host.startswith("www.") else "www." + host)

# Common public forum/content routes worth prioritizing.
PRIORITY_HINTS = (
    "thread", "forum", "showthread", "forumdisplay", "viewthread",
    "topic", "post", "comment", "game", "asset", "source", "download",
    "diendan", "t-", "f-", "category", "list"
)

SKIP_EXTENSIONS = {
    ".jpg",".jpeg",".png",".gif",".webp",".avif",".bmp",".apng",".svg",".ico",".mp3",".wav",".ogg",".flac",".m4a",
    ".mp4",".webm",".avi",".mov",".mkv",".m3u8",".ts",".zip",".rar",".7z",".tar",".gz",".exe",
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
    "textarea","code","pre","img","picture","video","audio","source","track","object","embed"
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
    text = unicodedata.normalize("NFC", text).replace("\u00a0", " ")
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

def split_candidate_text(text: str, hint: str = "") -> Iterable[tuple[str, str]]:
    text=normalize_text(text)
    if len(text)<1:return
    lang=detect(text,hint,langid)
    if lang:yield lang,text

def language_hint(node):
    cur=node if hasattr(node,"get") else getattr(node,"parent",None)
    while cur is not None:
        if hasattr(cur,"get") and cur.get("lang"):return cur.get("lang")
        cur=getattr(cur,"parent",None)
    return ""

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
    for tag in soup.select("[hidden], [aria-hidden=true], [translate=no], .notranslate"):
        tag.decompose()
    for tag in soup.find_all(BLOCK_TAGS):
        tag.decompose()

    rows: list[Extracted] = []
    seen_page = set()

    for node in soup.find_all(string=True):
        if isinstance(node, Comment):
            continue
        text = normalize_text(str(node))
        if not text or len(text) > 12000:
            continue
        for lang, segment in split_candidate_text(text,language_hint(node)):
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
            for lang, segment in split_candidate_text(val,language_hint(tag)):
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
                if m.group(1) is not None:
                    key=json.loads('"'+raw_key+'"')
                else:
                    key=raw_key.replace(r"\'", "'")
                    key=re.sub(r"\\u([0-9a-fA-F]{4})",lambda x:chr(int(x.group(1),16)),key)
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
        for lang in LANGUAGES:
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

class TextRenderer:
    """Reuse one browser; fetch only documents, scripts and text data needed by JS."""
    def __init__(self):
        self.playwright = self.browser = self.context = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def fetch(self, url):
        if not self.context:
            from playwright.async_api import async_playwright
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=True)
            self.context = await self.browser.new_context(user_agent=USER_AGENT, service_workers="block")
            await self.context.route("**/*", text_resource_route)
        page = await self.context.new_page()
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            # A short, bounded settle interval replaces the 8-second network-idle wait.
            await page.wait_for_timeout(500)
            return response.status if response else 0, await page.content(), page.url
        finally:
            await page.close()


async def text_resource_route(route):
    request = route.request
    if request.resource_type not in {"document", "script", "xhr", "fetch"} or Path(urlparse(request.url).path.lower()).suffix in SKIP_EXTENSIONS - {".js"}:
        await route.abort()
    elif request.resource_type == "document" and request.frame.parent_frame is not None:
        await route.abort()
    else:
        await route.continue_()


async def fetch_playwright(url):
    async with TextRenderer() as renderer:
        return await renderer.fetch(url)


def dictionary_paths(args, lang):
    root = Path(__file__).resolve().parents[1] / "dictionaries"
    paths = [str(root / (lang + ".js")), str(root / (lang + "-general.js"))]
    paths.extend(getattr(args, lang + "_dictionary", []))
    if args.update_dictionaries:
        paths.append(str(Path(args.update_dictionaries) / (lang + ".js")))
    return list(dict.fromkeys(paths))


def load_live_keys(path, known):
    if not path or not Path(path).is_file():
        return
    from live_dictionary import validate
    with Path(path).open(encoding="utf-8") as stream:
        for line in stream:
            try:
                entry = json.loads(line)
                pair = validate(entry.get("lang"), entry.get("source"), entry.get("translation"))
                if pair:
                    known[entry["lang"]].add(normalize_text(pair[0]).casefold())
            except (ValueError, TypeError, KeyError):
                continue


async def learn_rows(args, session, rows, known, attempted, used):
    """Batch network work; persist each successful response before the next request."""
    from live_dictionary import validate, merge
    groups = {lang: [] for lang in LANGUAGES}
    for row in rows:
        key = (row.lang, normalize_text(row.text).casefold())
        if key in attempted or key[1] in known[row.lang] or len(row.text) > 1200:
            continue
        if used + len(row.text) > args.translation_budget:
            continue
        attempted.add(key)
        used += len(row.text)
        groups[row.lang].append(row)
    size = getattr(args, "translation_batch_size", 12)
    for lang, group in groups.items():
        for start in range(0, len(group), size):
            batch = group[start:start + size]
            payload = {"q": [row.text for row in batch], "source": lang, "target": "en", "format": "text"}
            try:
                async with session.post(args.translate_url.rstrip("/") + "/translate", json=payload, timeout=aiohttp.ClientTimeout(total=45)) as reply:
                    reply.raise_for_status()
                    result = await reply.json()
                values = result.get("translatedText", [])
                if isinstance(values, str) and len(batch) == 1:
                    values = [values]
                if not isinstance(values, list) or len(values) != len(batch):
                    raise ValueError("Translation response does not match the request batch")
                pairs = {}
                for row, value in zip(batch, values):
                    pair = validate(lang, row.text, value)
                    if pair:
                        pairs[pair[0]] = pair[1]
                if args.update_dictionaries and pairs:
                    n = merge(Path(args.update_dictionaries) / (lang + ".js"), pairs)
                    if n:
                        print(f"[dictionary] {lang}: +{n}", flush=True)
                for source, value in pairs.items():
                    emit_live_translation(args.live_jsonl, lang, source, value)
                    known[lang].add(normalize_text(source).casefold())
            except Exception as error:
                print(f"[translate] {lang}: {error}", file=sys.stderr)
    return used


def priority(url: str) -> int:
    low = url.lower()
    return 0 if any(h in low for h in PRIORITY_HINTS) else 1

async def crawl(args):
    seeds = configured_sites(args)
    configure_hosts(seeds, args.allow_host)
    store = Store(Path(args.output))
    if args.delay<0 or args.max_pages<1 or args.concurrency<1:raise ValueError("Invalid crawler limits")
    learned_chars=0
    translated_seen=set()
    known={l:load_dictionary_keys(dictionary_paths(args,l)) for l in LANGUAGES}
    load_live_keys(args.live_jsonl, known)
    if not 1 <= getattr(args,"translation_batch_size",12) <= 30 or args.translation_budget < 0:
        raise ValueError("Invalid translation batch size or budget")
    known_generic=load_dictionary_keys(args.dictionary)
    known['zh']|=known_generic;known['vi']|=known_generic
    if any(known.values()):print('[dictionary] '+', '.join(f'{l}: {len(keys):,}' for l,keys in known.items()))
    queue = deque(canonicalize(x) for x in seeds)
    queued = set(queue)
    pages = 0
    last_by_host = {}

    headers = {"User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9,vi;q=0.8,en;q=0.5"}
    connector = aiohttp.TCPConnector(limit=args.concurrency, limit_per_host=1)

    async with aiohttp.ClientSession(headers=headers, connector=connector) as session, TextRenderer() as renderer:
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
                    status, html, final = await renderer.fetch(url)
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
                    not in known[r.lang]
                ]
                skipped_known = before - len(rows)
                store.save_rows(rows)
                if args.translate_url:
                    learned_chars = await learn_rows(args, session, rows, known, translated_seen, learned_chars)
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
    print("Files: crawl.sqlite3, {zh,vi,th,ru,pt,es,fr,ja}_corpus.tsv, {zh,vi,th,ru,pt,es,fr,ja}_unique.txt, stats.json")
    store.db.close()

def build_parser():
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-host",action="append",default=[],help="Additional exact public hostname; repeatable")
    ap.add_argument("--th-dictionary",action="append",default=[])
    ap.add_argument("--ru-dictionary",action="append",default=[])
    for lang in ("pt","es","fr","ja"):ap.add_argument("--"+lang+"-dictionary",action="append",default=[])
    ap.add_argument("--translate-url",default=DEFAULT_TRANSLATE_URL,help="Optional override of LocalTranslator Studio URL (default: http://localhost:5000)")
    ap.add_argument("--no-translate",dest="translate_url",action="store_const",const=None,help="Collect text only, without calling a translation server")
    ap.add_argument("--sites-file",type=Path,default=DEFAULT_SITES_FILE,help="UTF-8 text file with one site URL per line (default: tools/sites.txt)")
    ap.add_argument("--translation-budget",type=int,default=50000)
    ap.add_argument("--translation-batch-size",type=int,default=12,help="1–30 texts per API request; each successful batch is saved immediately")
    ap.add_argument("--live-jsonl",default="corpus_output/learned.jsonl")
    ap.add_argument("--update-dictionaries",default=str(Path(__file__).resolve().parents[1]/"dictionaries"),help="Editable modules directory (default: bundled dictionaries); save each successful translation batch")
    ap.add_argument("--no-update-dictionaries",dest="update_dictionaries",action="store_const",const=None,help="Keep corpus/learning logs without modifying JS modules")
    ap.add_argument("--seed", action="append", help="Override sites.txt with this starting URL; repeatable")
    ap.add_argument("--output", default="corpus_output")
    ap.add_argument("--max-pages", type=int, default=2000)
    ap.add_argument("--delay", type=float, default=1.25, help="Minimum seconds between requests to one host")
    ap.add_argument("--concurrency", type=int, default=4, help="HTTP connection limit; page discovery remains sequential")
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
    return ap


def main():
    ap = build_parser()
    args = ap.parse_args()
    try:
        asyncio.run(crawl(args))
    except (ValueError, OSError) as error:
        ap.error(str(error))




# v3.9 integration hook: call this whenever the crawler obtains a successful translation.
def emit_live_translation(jsonl_path, lang, source, translation):
    if not jsonl_path or not source or not translation or source.strip()==translation.strip(): return
    import json as _json
    from pathlib import Path as _Path
    p=_Path(jsonl_path);p.parent.mkdir(parents=True,exist_ok=True)
    with p.open("a",encoding="utf-8") as f:
        f.write(_json.dumps({"lang":lang,"source":source.strip(),"translation":translation.strip()},ensure_ascii=False)+"\n")


if __name__ == "__main__":
    main()
