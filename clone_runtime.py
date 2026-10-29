"""Lokale NeuTTS-Initialisierung mit den freigegebenen, heruntergeladenen Gewichten."""
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parent
os.environ['HF_HOME']=str(ROOT/'.cache/huggingface')
os.environ['XDG_CACHE_HOME']=str(ROOT/'.cache')
os.environ['TORCH_HOME']=str(ROOT/'.cache/torch')
import torch
from neutts import NeuTTS
from neucodec import DistillNeuCodec

class LocalNeuTTS(NeuTTS):
    def _load_codec(self, codec_repo, codec_device):
        self.codec=DistillNeuCodec(24000,480)
        state=torch.load(ROOT/'voices/neutts/codec/pytorch_model.bin',map_location='cpu',weights_only=True,mmap=True)
        self.codec.load_state_dict(state,strict=False)
        self.codec.eval().to(codec_device)
        self._is_onnx_codec=False

def load():
    torch.set_num_threads(2)
    return LocalNeuTTS(backbone_repo=str(ROOT/'voices/neutts/neutts-nano-german-Q4_0.gguf'),backbone_device='mps',codec_repo='local',codec_device='cpu',language='de',seed=42)
