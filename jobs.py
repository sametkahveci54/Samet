"""Cancellation of read/model requests, isolated by a random request identifier."""
import re
import secrets
import threading

LOCK = threading.Lock()
ACTIVE = {}
LOCAL = threading.local()


class Cancelled(ValueError):
    def __init__(self): super().__init__('Anfrage abgebrochen.')


def begin(identifier):
    if identifier is None: identifier = secrets.token_hex(16)
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9-]{32,40}', identifier):
        raise ValueError('Ungültige Anfragekennung.')
    with LOCK:
        if identifier in ACTIVE: raise ValueError('Anfragekennung bereits aktiv.')
        if len(ACTIVE) >= 30: raise ValueError('Zu viele gleichzeitige Anfragen.')
        ACTIVE[identifier] = threading.Event()
        LOCAL.event = ACTIVE[identifier]
    return identifier


def cancel(identifier):
    with LOCK:
        event = ACTIVE.get(identifier) if isinstance(identifier, str) else None
        if event: event.set()
    return {'message': 'Abbruch angefordert.', 'active': event is not None}


def check():
    event = getattr(LOCAL, 'event', None)
    if event is not None and event.is_set(): raise Cancelled()


def current(): return getattr(LOCAL, 'event', None)


def is_busy():
    with LOCK: return bool(ACTIVE)


def finish(identifier):
    with LOCK:
        if identifier: ACTIVE.pop(identifier, None)
    LOCAL.event = None
