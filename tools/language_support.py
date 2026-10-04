"""Supported English dictionary sources and conservative corpus detection."""
import re
LANGUAGES=('zh','vi','th','ru','pt','es','fr','ja')
PROFILES={
 'pt':set('não você arquivos pasta senha configurações baixar pesquisar obrigado olá português meus minhas'.split()),
 'es':set('usted archivos carpeta contraseña descargar buscar gracias hola español los las'.split()),
 'fr':set('vous fichiers dossier télécharger rechercher merci bonjour français des les avec'.split()),
 'vi':set('tải miễn phí người máy không đăng nhập diễn đàn'.split())}
def normalize(code):
 code=str(code or '').lower().replace('_','-')
 return 'pt' if code=='ptbr' else code.split('-')[0]
def detect(text,hint='',classifier=None):
 hint=normalize(hint)
 if re.search(r'[\u3040-\u30ff]',text):return 'ja'
 if re.search(r'[\u3400-\u9fff]',text):return 'ja' if hint=='ja' else 'zh'
 if re.search(r'[\u0e00-\u0e7f]',text):return 'th'
 if re.search(r'[\u0400-\u04ff]',text):return 'ru'
 if hint in ('pt','es','fr','vi') and re.search(r'[A-Za-zÀ-ỹ]',text):return hint
 words=set(re.findall(r'[^\W\d_]+',text.casefold()));scores=sorted(((len(words&p),l) for l,p in PROFILES.items()),reverse=True)
 if scores[0][0]>0 and scores[0][0]>scores[1][0]:return scores[0][1]
 if re.search(r'[đăơưạảầấậẩẫằắặẳẵềếệểễỉĩọỏồốộổỗờớợởỡụủừứựửữỵỷỹ]',text,re.I):return 'vi'
 if re.search(r'[ñ¿¡]',text,re.I):return 'es'
 if classifier and len(text)>=20:
  lang,_=classifier.classify(text)
  if lang in LANGUAGES:return lang
 return None
