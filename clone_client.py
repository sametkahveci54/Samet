"""Fester lokaler Worker, begrenzter RAM-Cache und keine Shell-Ausführung."""
import os,json,base64,subprocess,select,atexit
from pathlib import Path
from collections import OrderedDict
ROOT=Path(__file__).resolve().parent

class CloneClient:
    def __init__(self):
        self.process=None;self.cache=OrderedDict();atexit.register(self.close)
    def close(self):
        if self.process is not None and self.process.poll() is None:self.process.terminate()
        self.process=None
    def wav(self,text,rate):
        key=(text,rate)
        if key in self.cache:
            self.cache.move_to_end(key);return self.cache[key]
        if self.process is None or self.process.poll() is not None:
            env=dict(os.environ,HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_PROGRESS_BARS='1',TOKENIZERS_PARALLELISM='false')
            with open(ROOT/'clone.log','ab') as log:
                self.process=subprocess.Popen([str(ROOT/'.voice-venv/bin/python'),'-u',str(ROOT/'clone_speak.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,env=env,cwd=str(ROOT))
        try:
            self.process.stdin.write((json.dumps({'text':text,'rate':rate})+'\n').encode());self.process.stdin.flush()
            if not select.select([self.process.stdout],[],[],240)[0]:raise TimeoutError('Eigene Stimme: Zeitlimit überschritten.')
            line=self.process.stdout.readline()
            if not line:raise RuntimeError('Sprachworker wurde beendet; bitte erneut versuchen.')
            result=json.loads(line)
            if 'error' in result:raise RuntimeError(result['error'])
            audio=base64.b64decode(result['audio'],validate=True)
        except Exception:
            self.close();raise
        self.cache[key]=audio
        while len(self.cache)>4:self.cache.popitem(last=False)
        return audio
