import concurrent.futures,hashlib,io,json,pathlib,tarfile,urllib.request,xml.etree.ElementTree as ET
import argparse
p=argparse.ArgumentParser();p.add_argument('--cache',default='dictionary-downloads');a=p.parse_args();root=pathlib.Path(a.cache);root.mkdir(parents=True,exist_ok=True);
codes={'eng':'en','por':'pt','spa':'es','fra':'fr','jpn':'ja','zho':'zh','vie':'vi','tha':'th','rus':'ru'}
records=[]
metadata=urllib.request.urlopen('https://freedict.org/freedict-database.json',timeout=60).read();(root/'freedict-metadata.json').write_bytes(metadata)
for item in json.loads(metadata):
 if 'name' not in item:continue
 a,b=item['name'].split('-')
 if a in codes and b in codes:records.append(item)
def fetch(d):
 r=next(x for x in d['releases'] if x['platform']=='src');p=root/(d['name']+'.tar.xz')
 if not p.exists():p.write_bytes(urllib.request.urlopen(r['URL'],timeout=90).read())
 raw=p.read_bytes();assert hashlib.sha512(raw).hexdigest()==r['checksum']
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:xz') as t:
  member=next(m for m in t.getmembers() if m.name.endswith('.tei'));xml=t.extractfile(member).read()
 doc=ET.fromstring(xml);ns={'t':'http://www.tei-c.org/ns/1.0'}
 lic=doc.find('.//t:availability',ns);license=' '.join(lic.itertext()).strip() if lic is not None else 'unknown'
 pairs={}
 for e in doc.findall('.//t:entry',ns):
  orths=e.findall('./t:form/t:orth',ns);quotes=e.findall('.//t:cit[@type="trans"]/t:quote',ns);target=codes[d['name'].split('-')[1]]
  checks={'zh':r'[\u3400-\u9fff]','ja':r'[\u3040-\u30ff\u3400-\u9fff]','ru':r'[\u0400-\u04ff]','th':r'[\u0e00-\u0e7f]'}
  q=next((q for q in quotes if target not in checks or __import__('re').search(checks[target],' '.join(q.itertext()))),None)
  orth=orths[0] if orths else None
  if orth is None or q is None:continue
  a=' '.join(orth.itertext()).strip();b=' '.join(q.itertext()).strip()
  if a and b and len(a)<=120 and len(b)<=160 and any(c.isalpha() for c in a) and not any(c in b for c in '|;{}') and a not in {'__proto__','constructor','prototype'}:
   for orth in orths:
    a=' '.join(orth.itertext()).strip()
    if a and len(a)<=120 and a not in {'__proto__','constructor','prototype'} and (codes[d['name'].split('-')[0]] not in checks or __import__('re').search(checks[codes[d['name'].split('-')[0]]],a)):pairs.setdefault(a,b)
 source,target=(codes[x] for x in d['name'].split('-'))
 (root/(source+'-'+target+'.json')).write_text(json.dumps(pairs,ensure_ascii=False))
 result={'source':source,'target':target,'name':d['name'],'url':r['URL'],'source_sha512':r['checksum'],'license':license,'entries':len(pairs),'complete_download':True,'version':d['edition']}
 print(d['name'],len(pairs),license[:125],flush=True);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:out=list(pool.map(fetch,records))
(root/'freedict-sources.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
