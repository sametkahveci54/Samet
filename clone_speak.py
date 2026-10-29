"""Lokaler Sprachworker; JSON-Zeilen rein, WAV als Base64 raus. Ende nach 90 s Ruhe."""
import sys,contextlib,io,re,json,select,base64,time
with contextlib.redirect_stdout(sys.stderr):
    import numpy as np,torch,soundfile as sf
    from clone_runtime import ROOT,load
    tts=load()
    folder=ROOT/'voices/eigene-stimme'
    codes=torch.from_numpy(np.load(folder/'referenz-codes.npy',allow_pickle=False))
    reference=(folder/'referenz.txt').read_text().strip()

def render(request):
    text=request['text'];rate=float(request.get('rate',1))
    if not isinstance(text,str) or not 0<len(text)<=2400 or not .8<=rate<=1.15:raise ValueError('Ungültiger Sprachtext.')
    chunks=[np.zeros(8400,dtype=np.float32)]
    for sentence in re.split(r'(?<=[.!?])\s+|\n+',text):
        parts=[];part=''
        for word in sentence.split():
            if len(part)+len(word)>160 and part:parts.append(part);part=''
            part=(part+' '+word).strip()
        if part:parts.append(part)
        for part in parts:
            y=tts.infer(part,codes,reference,temperature=.7)
            if not np.isfinite(y).all() or len(y)<2400:raise ValueError('Keine gültige Sprachantwort.')
            chunks.extend([y,np.zeros(4800,dtype=np.float32)])
    y=np.concatenate(chunks)
    if rate!=1:
        import librosa
        y=librosa.effects.time_stretch(y.astype(np.float32),rate=rate)
    peak=float(np.max(np.abs(y)))
    if peak>.95:y=y*.95/peak
    out=io.BytesIO();sf.write(out,y,24000,format='WAV',subtype='PCM_16')
    return out.getvalue()

try:
    while select.select([sys.stdin],[],[],90)[0]:
        line=sys.stdin.readline()
        if not line:break
        try:
            with contextlib.redirect_stdout(sys.stderr):audio=render(json.loads(line))
            result={'audio':base64.b64encode(audio).decode()}
        except Exception as e:result={'error':str(e)}
        print(json.dumps(result),flush=True)
finally:
    tts.backbone.close()
