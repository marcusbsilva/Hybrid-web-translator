#!/usr/bin/env python3
"""Convert CC-CEDICT to a separate, attributed Chinese general vocabulary module."""
import argparse,json,re
from pathlib import Path
BAD=('surname ','variant of ','old variant of ','see also ','abbr. for ','used in ','classifier for ')
PAT=re.compile(r'^(\S+)\s+(\S+)\s+\[[^]]*\]\s+/(.*)/$')
def build(lines,limit=160000):
    data={}
    for line in lines:
        m=PAT.match(line.rstrip())
        if not m:continue
        trad,simp,raw=m.groups();gloss=None
        for part in raw.split('/'):
            part=part.strip()
            if any(part.lower().startswith(b) for b in BAD):continue
            part=re.sub(r'\([^)]*\)','',part).strip();part=re.sub(r'\s+',' ',part)
            if part and len(part)<=80 and not part.startswith('CL:'):gloss=part;break
        if not gloss:continue
        for word in (simp,trad):
            if 1<=len(word)<=12 and len(data)<limit:data.setdefault(word,gloss)
        if len(data)>=limit:break
    return data

def write(output,data):
    Path(output).write_text('// CC-CEDICT contributors, CC BY-SA 4.0; simplified/traditional; first concise gloss.\n// Derived by filtering names, variants and long definitions. See THIRD_PARTY_NOTICES.md.\nObject.assign(globalThis.SPT_ZH,'+json.dumps(data,ensure_ascii=False,separators=(',',':'))+');\n',encoding='utf-8')
def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('input');ap.add_argument('output');ap.add_argument('max_entries',type=int,nargs='?',default=160000);a=ap.parse_args()
    with open(a.input,encoding='utf-8') as f:data=build(f,a.max_entries)
    write(a.output,data);print('entries:',len(data))
if __name__=='__main__':main()
