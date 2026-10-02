#!/usr/bin/env python3
"""Build compact JS dictionaries from CC-CEDICT or simple TSV/JSON-like sources.
Usage: python build_dictionary.py cedict.txt out.js [max_entries]
Keeps simplified+traditional forms, prefers concise first English gloss, filters names/archaic noise.
"""
import re,sys,json
src=sys.argv[1]; out=sys.argv[2]; limit=int(sys.argv[3]) if len(sys.argv)>3 else 60000
bad=('surname ','variant of ','old variant of ','see also ','abbr. for ','used in ','classifier for ')
d={}
pat=re.compile(r'^(\S+)\s+(\S+)\s+\[[^]]*\]\s+/(.*)/$')
def clean(gloss):
    parts=[x.strip() for x in gloss.split('/') if x.strip()]
    for x in parts:
        lx=x.lower()
        if any(lx.startswith(b) for b in bad): continue
        x=re.sub(r'\([^)]*\)','',x).strip()
        x=re.sub(r'\s+',' ',x)
        if 0<len(x)<=80 and not x.startswith('CL:'): return x
    return None
with open(src,encoding='utf-8') as f:
    for line in f:
        if line.startswith('#'): continue
        m=pat.match(line.rstrip())
        if not m: continue
        trad,simp,g=m.groups(); val=clean(g)
        if not val: continue
        if 1<=len(simp)<=12: d.setdefault(simp,val)
        if trad!=simp and 1<=len(trad)<=12: d.setdefault(trad,val)
        if len(d)>=limit: break
with open(out,'w',encoding='utf-8') as f:
    f.write('// Generated from CC-CEDICT. Preserve CC BY-SA attribution/license.\n')
    f.write('Object.assign(globalThis.SPT_ZH,')
    json.dump(d,f,ensure_ascii=False,separators=(',',':'))
    f.write(');\n')
print('entries:',len(d))
