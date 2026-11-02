"""Create an explicitly submitted 15-minute appointment without model extraction."""
import json
from datetime import datetime, timedelta
import integrations as accounts
from calendar_action import execute


def create(data):
    title = data.get('title')
    if not isinstance(title, str) or not title.strip() or len(title) > 200:
        raise ValueError('Bitte einen Betreff mit höchstens 200 Zeichen eingeben.')
    try:
        day, clock = data.get('date'), data.get('time')
        if not isinstance(day, str) or not isinstance(clock, str):
            raise ValueError()
        naive = datetime.strptime(day + ' ' + clock, '%Y-%m-%d %H:%M')
        start = naive.replace(tzinfo=accounts.BERLIN)
        if start.utcoffset() != naive.replace(tzinfo=accounts.BERLIN, fold=1).utcoffset():
            raise ValueError()
        if start.astimezone(accounts.timezone.utc).astimezone(accounts.BERLIN).replace(tzinfo=None) != naive:
            raise ValueError()
        if start <= datetime.now(accounts.BERLIN):
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('Bitte ein zukünftiges Datum und eine eindeutige Uhrzeit eingeben. Zeitzone Berlin.') from None
    fields = {'title':title.strip(), 'start':start.isoformat(),
              'end':(start+timedelta(minutes=15)).isoformat(), 'location':'', 'reminder':15}
    source = json.dumps(fields, ensure_ascii=False, sort_keys=True)
    return execute(source, fields, 'Arbeit', data.get('request_id'), False)
