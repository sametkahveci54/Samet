"""Lokale Victoria-Ausgabe (Kokoro/ONNX), keine Netzwerkzugriffe."""
import io, wave
from pathlib import Path
import numpy as np
import onnxruntime as ort
from piper.phonemize_espeak import EspeakPhonemizer

class Victoria:
    def __init__(self, root):
        folder=Path(root)/'voices/victoria'
        options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
        self.model=ort.InferenceSession(str(folder/'model.int8.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
        self.styles=np.fromfile(folder/'voices.bin',dtype=np.float32).reshape(-1,256)
        self.vocab={}
        for line in (folder/'tokens.txt').read_text().splitlines():
            char, number=line.rsplit(' ',1);self.vocab[char]=int(number)
        self.phonemizer=EspeakPhonemizer()

    def wav(self, text, rate=1.0):
        chunks=[np.zeros(8400,dtype=np.float32)] # 350 ms Vorlauf gegen verschluckte erste Laute
        for sentence in self.phonemizer.phonemize('de',text):
            phonemes=''.join(sentence).replace('ʏ','y').replace('g','ɡ')
            ids=[self.vocab[c] for c in phonemes if c in self.vocab]
            for start in range(0,len(ids),480):
                part=ids[start:start+480]
                if not part:continue
                audio=self.model.run(None,{'tokens':np.array([[0]+part+[0]],dtype=np.int64),'style':self.styles[len(part)].reshape(1,256),'speed':np.array([rate],dtype=np.float32)})[0].reshape(-1)
                if not np.isfinite(audio).all():raise ValueError('Ungültiges Sprachsignal.')
                chunks.extend([audio,np.zeros(4800,dtype=np.float32)])
        if len(chunks)==1:raise ValueError('Text konnte nicht gesprochen werden.')
        signal=np.concatenate(chunks)
        # Pegel begrenzen, ohne leise Hintergrundartefakte künstlich anzuheben.
        peak=float(np.max(np.abs(signal)))
        if peak>0.95:signal*=0.95/peak
        pcm=(np.clip(signal,-1,1)*32767).astype('<i2')
        output=io.BytesIO()
        with wave.open(output,'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000);f.writeframes(pcm.tobytes())
        return output.getvalue()
