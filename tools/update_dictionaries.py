#!/usr/bin/env python3
"""Refresh open vocabulary modules; keep hand-edited domain files untouched."""
import argparse,gzip,hashlib,io,json,urllib.request
from datetime import datetime,timezone
from pathlib import Path
from build_dictionary import build,write as write_chinese
from import_dictionary import entries,write

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--lang',choices=['all','zh','vi','th','ru','pt','es','fr','ja'],default='all');ap.add_argument('--output',default=str(Path(__file__).resolve().parents[1]/'dictionaries'));ap.add_argument('--limit',type=int,default=2000000);ap.add_argument('--zh-limit',type=int,default=2000000);ap.add_argument('--max-bytes',type=int,default=2000000000);a=ap.parse_args();root=Path(a.output);root.mkdir(parents=True,exist_ok=True);meta=[]
    if min(a.limit,a.zh_limit,a.max_bytes)<1:ap.error('limits must be positive')
    for lang in (['zh','vi','th','ru','pt','es','fr','ja'] if a.lang=='all' else [a.lang]):
        digest=hashlib.sha256();consumed=0
        if lang=='zh':url='https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz'
        else:url=f'https://kaikki.org/dictionary/{ {"vi":"Vietnamese","th":"Thai","ru":"Russian","pt":"Portuguese","es":"Spanish","fr":"French","ja":"Japanese"}[lang] }/kaikki.org-dictionary-{ {"vi":"Vietnamese","th":"Thai","ru":"Russian","pt":"Portuguese","es":"Spanish","fr":"French","ja":"Japanese"}[lang] }.jsonl'
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HybridTranslatorDictionaryUpdater/4.0'}),timeout=60) as response:
            if lang=='zh':
                raw=response.read(a.max_bytes+1)
                if len(raw)>a.max_bytes:raise ValueError('CC-CEDICT download exceeds byte limit')
                digest.update(raw);consumed=len(raw);data=build(io.StringIO(gzip.decompress(raw).decode('utf-8')),a.zh_limit)
            else:
                def bounded_lines():
                    nonlocal consumed
                    for line in response:
                        if consumed+len(line)>a.max_bytes:break
                        digest.update(line);consumed+=len(line);yield line
                data=entries(bounded_lines(),lang,a.limit)
        if not data:raise ValueError(f'Empty {lang} dictionary; previous file preserved')
        target=root/f'{lang}-general.js';temporary=target.with_suffix('.tmp');(write_chinese(temporary,data) if lang=='zh' else write(temporary,lang,data));temporary.replace(target)
        meta.append({'language':lang,'url':url,'entries':len(data),'downloaded_bytes':consumed,'downloaded_prefix_sha256':digest.hexdigest(),'fetched_at':datetime.now(timezone.utc).isoformat()});print(lang,len(data),'entries')
    (root/'last-update.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
if __name__=='__main__':main()
