#!/usr/bin/env python3
import argparse,json,os,re,tempfile,time
from pathlib import Path
from language_support import LANGUAGES
PAIR_RE=re.compile(r'^\s*"((?:\\.|[^"])*)"\s*:\s*"((?:\\.|[^"])*)"\s*,?\s*$')
def unesc(s):
    try:return json.loads('"'+s+'"')
    except:return s
def load(path):
    out={}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            m=PAIR_RE.match(line)
            if m:out[unesc(m.group(1))]=unesc(m.group(2))
    return out
def validate(lang,a,b):
    if not isinstance(a,str) or not isinstance(b,str):return None
    if a in ("__proto__","constructor","prototype"):return None
    a=" ".join(a.split());b=" ".join(b.split())
    if lang not in LANGUAGES:return None
    if not a or not b or a==b or len(a)>1200 or len(b)>4000:return None
    if lang=="zh" and not re.search(r"[\u3400-\u9fff]",a):return None
    if lang=="vi" and not re.search(r"[A-Za-zÀ-ỹ]",a):return None
    if lang=="th" and not re.search(r"[\u0e00-\u0e7f]",a):return None
    if lang in ("pt","es","fr") and not re.search(r"[A-Za-zÀ-ÿ]",a):return None
    if lang=="ja" and not re.search(r"[\u3040-\u30ff\u3400-\u9fff]",a):return None
    if lang=="ru" and not re.search(r"[\u0400-\u04ff]",a):return None
    if re.search(r"[\u3040-\u30ff\u3400-\u9fff\u0e00-\u0e7f\u0400-\u04ff]",b):return None
    return a,b
def merge(path,pairs):
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():path.write_text("globalThis.SPT_"+path.stem.upper()+" = {};\n",encoding="utf-8")
    text=path.read_text(encoding="utf-8");known=load(path)
    fresh={k:v for k,v in pairs.items() if k not in known}
    if not fresh:return 0
    a=text.find("{");b=text.rfind("}")
    if a<0 or b<=a:raise RuntimeError(f"Dictionary object not found: {path}")
    body=text[a+1:b].rstrip()
    if body and not body.endswith(","):body+=","
    rows=["  "+json.dumps(k,ensure_ascii=False)+": "+json.dumps(v,ensure_ascii=False)+"," for k,v in sorted(fresh.items())]
    updated=text[:a+1]+"\n"+body+"\n"+"\n".join(rows)+"\n"+text[b:]
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix=path.name+".",suffix=".tmp")
    try:
        with os.fdopen(fd,"w",encoding="utf-8",newline="\n") as f:f.write(updated);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return len(fresh)
def main():
    root=Path(__file__).resolve().parents[1]
    ap=argparse.ArgumentParser()
    ap.add_argument("--input",required=True)
    for lang in LANGUAGES:ap.add_argument("--"+lang,default=str(root/"dictionaries"/(lang+".js")))
    ap.add_argument("--watch",action="store_true");ap.add_argument("--interval",type=float,default=1)
    args=ap.parse_args();src=Path(args.input);pos=0
    while True:
        batch={l:{} for l in LANGUAGES}
        if src.exists():
            with src.open("r",encoding="utf-8") as f:
                if src.stat().st_size<pos:pos=0
                f.seek(pos)
                while True:
                    start=f.tell();line=f.readline()
                    if not line:break
                    if not line.endswith("\n"):
                        f.seek(start);break
                    try:
                        r=json.loads(line);lang=r.get("lang");v=validate(lang,r.get("source",""),r.get("translation",""))
                        if v and lang in batch:batch[lang][v[0]]=v[1]
                    except Exception:pass
                pos=f.tell()
            for lang,path in ((l,Path(getattr(args,l))) for l in LANGUAGES):
                n=merge(path,batch[lang])
                if n:print(f"[live-dictionary] {lang}: +{n} -> {path}",flush=True)
        if not args.watch:break
        time.sleep(max(.2,args.interval))
if __name__=="__main__":main()
