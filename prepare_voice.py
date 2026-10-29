"""Bereitet nur die lokale eigene Aufnahme vor; kein Audio-Upload."""
import os,json,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parent
os.environ['HF_HOME']=str(ROOT/'.cache/huggingface')
os.environ['XDG_CACHE_HOME']=str(ROOT/'.cache')
from faster_whisper import WhisperModel
import soundfile as sf
folder=ROOT/'voices/eigene-stimme'
model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=2,download_root=str(ROOT/'.cache/whisper'))
segments, info=model.transcribe(str(folder/'aufnahme.wav'),language='de',beam_size=5,word_timestamps=True,vad_filter=True)
parts=[{'start':s.start,'end':s.end,'text':s.text.strip()} for s in segments]
(folder/'transkript.json').write_text(json.dumps(parts,ensure_ascii=False,indent=2))
print(json.dumps(parts,ensure_ascii=False,indent=2),flush=True)
chosen=[]
for part in parts:
    if not chosen:chosen.append(part)
    elif part['end']-chosen[0]['start']<=13:chosen.append(part)
    else:break
if not chosen or chosen[-1]['end']-chosen[0]['start']>15:raise RuntimeError('Kein geeigneter kurzer Referenzausschnitt. Manuell prüfen.')
x,sr=sf.read(folder/'aufnahme.wav')
start=max(0,chosen[0]['start']-.12);end=min(len(x)/sr,chosen[-1]['end']+.15)
x=x[int(start*sr):int(end*sr)]
peak=max(abs(x))
if peak>0:x=x*min(4,.8/peak)
sf.write(folder/'referenz.wav',x,sr,subtype='PCM_16')
text=' '.join(p['text'] for p in chosen)
(folder/'referenz.txt').write_text(text+'\n')
print('Referenz:',round(end-start,2),'Sekunden;',text,flush=True)
