"""Lokaler Klontest; Audio wird nicht hochgeladen."""
import os,time,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
os.environ['HF_HOME']=str(ROOT/'.cache/huggingface')
os.environ['XDG_CACHE_HOME']=str(ROOT/'.cache')
os.environ['TORCH_HOME']=str(ROOT/'.cache/torch')
import torch, numpy as np, soundfile as sf
from clone_runtime import load
folder=ROOT/'voices/eigene-stimme'
torch.set_num_threads(2)
start=time.time()
print('Lade lokale Klon-Engine …',flush=True)
tts=load()
if (folder/'referenz-codes.npy').exists():
    codes=torch.from_numpy(np.load(folder/'referenz-codes.npy'))
else:
    codes=tts.encode_reference(str(folder/'referenz.wav'))
    np.save(folder/'referenz-codes.npy',codes.cpu().numpy())
print('Referenz kodiert nach',round(time.time()-start,1),'Sekunden',flush=True)
text='Hallo! Ich bin Jarvis. Deine eigene Stimme ist jetzt für einen ersten Test vorbereitet.'
y=tts.infer(text,codes,(folder/'referenz.txt').read_text().strip(),temperature=.7)
y=np.concatenate([np.zeros(8400),y,np.zeros(4800)])
if not np.isfinite(y).all() or len(y)<24000:raise RuntimeError('Kein gültiges Sprachsignal.')
sf.write(folder/'hoerprobe.wav',y,24000,subtype='PCM_16')
(folder/'test-ergebnis.json').write_text(json.dumps({'seconds':round(time.time()-start,1),'audio_seconds':round(len(y)/24000,1),'test_text':text,'generated':True},ensure_ascii=False,indent=2))
print('Klon-Hörprobe erstellt:',round(time.time()-start,1),'Sekunden insgesamt;',round(len(y)/24000,1),'Sekunden Audio',flush=True)

tts.backbone.close()
