#!/usr/bin/env python3
import argparse,json
from pathlib import Path
from live_dictionary import validate
from language_support import LANGUAGES
ap=argparse.ArgumentParser();ap.add_argument('input');ap.add_argument('output');a=ap.parse_args()
dictionaries={l:{} for l in LANGUAGES}
with open(a.input,encoding='utf-8') as f:
    for number,line in enumerate(f,1):
        try:
            r=json.loads(line);pair=validate(r.get('lang'),r.get('source',''),r.get('translation',''))
            if pair:dictionaries[r['lang']][pair[0]]=pair[1]
        except ValueError:print('Skipping malformed line',number)
Path(a.output).write_text(json.dumps({'dictionaries':dictionaries},ensure_ascii=False,indent=2),encoding='utf-8')
print(sum(map(len,dictionaries.values())),'entries exported')
