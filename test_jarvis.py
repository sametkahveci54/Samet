import os, json, urllib.request, urllib.error
from pathlib import Path
BASE='http://127.0.0.1:8765'
def get(path):
    with urllib.request.urlopen(BASE+path,timeout=15) as r: return r.read()
token=json.loads(get('/api/session'))['token']
def post(path,data,auth=True):
    headers={'Content-Type':'application/json'}
    if auth: headers['X-Jarvis-Token']=token
    req=urllib.request.Request(BASE+path,json.dumps(data).encode(),headers)
    with urllib.request.urlopen(req,timeout=200) as r:return json.load(r)
assert b'JARVIS' in get('/')
assert json.loads(get('/api/status'))['online']
print('Web-Oberfläche und Ollama: OK',flush=True)
for action in ['safari','rechner']:
    print(post('/api/action',{'action':action}),flush=True)
print(post('/api/action',{'action':'notiz','text':'Jarvis-Funktionstest: Notizen werden lokal gespeichert.'}),flush=True)
assert any('Jarvis-Funktionstest' in p.read_text() for p in Path('Notizen').glob('*.txt'))
for data,auth,expected in [({'action':'shell','command':'echo unerlaubt'},True,400),({'action':'safari'},False,403)]:
    try:post('/api/action',data,auth);raise AssertionError('Muss abgelehnt werden')
    except urllib.error.HTTPError as e:assert e.code==expected
print('Unbekannte Aktionen und fehlender Token: korrekt abgelehnt',flush=True)
print('Modellantwort:',post('/api/chat',{'messages':[{'role':'user','content':'Antworte kurz auf Deutsch: Was ist 2 plus 2?'}]})['message'],flush=True)
config = Path(__file__).resolve().parent / 'config.local.json'
host = json.loads(config.read_text()).get('tailscale_host', '') if config.is_file() else ''
url = os.environ.get('JARVIS_TEST_HTTPS', ('https://' + host + '/') if host else '')
if url:
    with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200 and b'JARVIS' in r.read()
    print('HTTPS mit gültigem Zertifikat: OK',flush=True)
