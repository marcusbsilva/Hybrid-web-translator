#!/usr/bin/env python3
"""Import English Wiktionary JSONL (Kaikki) or curated TSV without overwriting domain terms."""
import argparse, json, re
from pathlib import Path

def entries(lines, lang, limit=30000):
    out={}
    for line in lines:
        try:
            row=json.loads(line)
        except (ValueError,TypeError):continue
        word=row.get('word','').strip().lower()
        if word in ('__proto__','constructor','prototype'):continue
        if not word or len(word)>70 or row.get('lang_code')!=lang:continue
        for sense in row.get('senses',[]):
            tags=set(sense.get('tags',[]))
            if tags & {'form-of','inflection-of','archaic','obsolete','rare','surname','given-name','proper-noun'}:continue
            gloss=(sense.get('glosses') or [''])[0]
            gloss=re.sub(r'^\([^)]*\)\s*','',gloss).strip().rstrip('.')
            if not gloss or len(gloss)>100 or re.search(r'\b(form of|plural of|spelling of|romanization of)\b',gloss,re.I):continue
            out.setdefault(word,gloss);break
        if len(out)>=limit:break
    return out

def write(path,lang,data):
    Path(path).write_text('// English Wiktionary via Kaikki; CC BY-SA / GFDL. See THIRD_PARTY_NOTICES.md.\nObject.assign(globalThis.SPT_'+lang.upper()+','+json.dumps(data,ensure_ascii=False,separators=(',',':'))+');\n',encoding='utf-8')

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('input');ap.add_argument('output');ap.add_argument('--lang',choices=['zh','vi','th','ru','pt','es','fr','ja'],required=True);ap.add_argument('--limit',type=int,default=30000);ap.add_argument('--format',choices=['jsonl','tsv'],default='jsonl');a=ap.parse_args()
    with open(a.input,encoding='utf-8') as f:
        if a.format=='jsonl':data=entries(f,a.lang,a.limit)
        else:
            data={}
            for line in f:
                pair=line.rstrip('\n').split('\t',1)
                if len(pair)==2 and all(pair) and not line.startswith('#'):data[pair[0]]=pair[1]
                if len(data)>=a.limit:break
    write(a.output,a.lang,data);print(len(data),'entries written')
if __name__=='__main__':main()
