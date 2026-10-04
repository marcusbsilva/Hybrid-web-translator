import json,pathlib,re,unicodedata,shutil,tarfile,xml.etree.ElementTree as ET
import argparse
p=argparse.ArgumentParser();p.add_argument('--cache',default='dictionary-downloads');p.add_argument('--project-root',default=str(pathlib.Path(__file__).resolve().parents[1]));a=p.parse_args();root=pathlib.Path(a.project_root);droot=root/'dictionaries';download=pathlib.Path(a.cache);
pairroot=droot/'pairs';pairroot.mkdir(exist_ok=True)
langs=['en','zh','vi','th','ru','pt','es','fr','ja'];packs={target:{} for target in langs}
def key(s):return unicodedata.normalize('NFC',s.strip()).lower()
for p in download.glob('??-??.json'):
 source,target=p.stem.split('-');table=packs[target].setdefault(source,{})
 for a,b in json.loads(p.read_text()).items():table.setdefault(key(a),b)
# Safe English glosses provide additional pivots, especially for Vietnamese/Thai.
source_meta=json.load(open(download/'general-sources.json')) if (download/'general-sources.json').exists() else json.load(open(root/'docs/dictionary-sources.json'))
for source in langs[1:]:
 general=download/(source+'-general.js');general=general if general.exists() else droot/(source+'-general.js');module=general.read_text();raw=json.loads(module[module.index('{'):module.rindex('}')+1])
 if general!=droot/(source+'-general.js'):shutil.copyfile(general,droot/(source+'-general.js'))
 english=packs['en'].setdefault(source,{})
 inverse=packs[source].setdefault('en',{})
 for a,b in raw.items():
  b=re.sub(r'^to ','',b.split(';')[0]).strip();words=b.split()
  if not words or len(b)>45 or len(words)>5 or re.search(r'[;:(),|\[\]{}]',b) or re.search(r'[^\x00-\x7f]',b):continue
  if re.match(r'(?i)^(see |variant |surname |an? |the |alternative |abbreviation |romanization )',b) or re.search(r'(?i)\b(province|prefecture|surname|county|district|pinyin|romanization|spelling|form of|plural of)\b',b):continue
  if (source in ['zh','ja','th'] and len(a)<2) or a in {'__proto__','prototype','constructor'}:continue
  english.setdefault(key(a),b);inverse.setdefault(key(b),a)
# Exact simplified/traditional aliases from the same CC-CEDICT headword record.
import gzip,urllib.request
cedict=download/'cedict-aliases.txt.gz'
if not cedict.exists():cedict.write_bytes(urllib.request.urlopen('https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz',timeout=60).read())
for line in gzip.decompress(cedict.read_bytes()).decode().splitlines():
 m=re.match(r'^(\S+)\s+(\S+)\s+\[',line)
 if not m:continue
 traditional,simplified=m.groups()
 for pack in packs.values():
  table=pack.get('zh',{})
  if key(traditional) in table:table.setdefault(key(simplified),table[key(traditional)])
  if key(simplified) in table:table.setdefault(key(traditional),table[key(simplified)])

# Keep complete source archives for GPL datasets; retain all header credits for others.
third=root/'third_party'/'freedict';third.mkdir(parents=True,exist_ok=True)
meta=json.load(open(download/'freedict-sources.json'))
for record in meta:
 p=download/(record['name']+'.tar.xz')
 if 'General Public' in record['license']:shutil.copyfile(p,third/p.name)
 with tarfile.open(p,'r:xz') as tar:
  member=next(m for m in tar.getmembers() if m.name.endswith('.tei'));doc=ET.fromstring(tar.extractfile(member).read())
  header=doc.find('{http://www.tei-c.org/ns/1.0}teiHeader');ET.ElementTree(header).write(third/(record['name']+'-credits.xml'),encoding='utf-8',xml_declaration=True)
counts={}
for target,pack in packs.items():
 (pairroot/(target+'.json')).write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':')))
 counts[target]={s:len(t) for s,t in pack.items()}
(droot/'pair-counts.json').write_text(json.dumps(counts,indent=2))
(root/'docs/dictionary-sources.json').write_text(json.dumps(source_meta,indent=2))
(root/'docs/bilingual-sources.json').write_text(json.dumps(meta,indent=2))
print('Bilingual pack entries by destination:',{t:sum(s.values()) for t,s in counts.items()});print('Total',sum(sum(s.values()) for s in counts.values()))
