"""Isolated push runtime. Private keys never leave Application Support."""
import base64
import json
import os
from pathlib import Path
import sys
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException

folder = Path.home() / 'Library/Application Support/Jarvis/Bitcoin'
folder.mkdir(parents=True, exist_ok=True, mode=0o700)
keyfile = folder / 'private-key.pem'
if not keyfile.exists():
    key = ec.generate_private_key(ec.SECP256R1())
    with os.fdopen(os.open(keyfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as stream:
        stream.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
key = serialization.load_pem_private_key(keyfile.read_bytes(), None)
public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
(folder / 'public-key.txt').write_text(base64.urlsafe_b64encode(public).decode().rstrip('='))
if '--init' in sys.argv:
    sys.exit(0)
item = json.load(sys.stdin)
try:
    response = webpush(subscription_info=item['subscription'],
        data=json.dumps({k:item[k] for k in ('title', 'body', 'tag')}, ensure_ascii=False),
        vapid_private_key=str(keyfile), vapid_claims={'sub': 'https://' + item['host']},
        ttl=3600, timeout=15, requests_session=None)
    status = 'accepted' if 200 <= response.status_code < 300 else 'retry'
except WebPushException as error:
    code = error.response.status_code if error.response is not None else 0
    status = 'expired' if code in (404, 410) else 'retry' if code else 'uncertain'
except Exception:
    status = 'uncertain'
print(json.dumps({'status': status}))
