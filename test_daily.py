import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import assistant_actions as actions
import diagnostics
import integrations as accounts
import jobs
import personal
import server


class Vault:
    def get(self,provider): return {'email':'test@example.invalid','password':'test-app-password'}


class DailyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.file=Path(self.temp.name)/'private/personal.json'
        self.p=patch.object(personal,'FILE',self.file);self.p.start();self.addCleanup(self.p.stop)
        accounts.PENDING_EVENTS.clear();actions.PENDING.clear();accounts.MAIL_CACHE.clear()
        self.calendar={'id':'https://p01-caldav.icloud.com/123/calendar/','name':'Privat','writable':True}
        start=datetime.now(accounts.BERLIN)+timedelta(days=1)
        self.event={'title':'Werkstatt','start':start.isoformat(),'end':(start+timedelta(hours=1)).isoformat(),
                    'location':'Berlin','calendar_id':self.calendar['id'],'reminder':15}

    def test_personal_is_local_private_and_editable(self):
        result=personal.handle('/api/personal/task/add',{'title':'Anrufen','due':'2026-12-01'})
        item=result['state']['tasks'][0]
        self.assertEqual(self.file.stat().st_mode&0o777,0o600)
        result=personal.handle('/api/personal/task/update',{**item,'title':'Werkstatt anrufen','done':True})
        self.assertTrue(result['state']['tasks'][0]['done'])
        personal.handle('/api/personal/task/delete',{'id':item['id']})
        self.assertEqual(personal.load()['tasks'],[])

    def test_memory_is_explicit_and_can_be_deleted(self):
        self.assertEqual(personal.context(),'')
        result=personal.handle('/api/personal/memory/add',{'text':'Ich bevorzuge kurze Antworten.'})
        entry=result['state']['memories'][0]
        self.assertIn('kurze Antworten',personal.context())
        personal.handle('/api/personal/memory/save',{'id':entry['id'],'text':'Ich bevorzuge ausführliche Antworten.'})
        self.assertIn('ausführliche',personal.context())
        personal.handle('/api/personal/memory/delete',{'id':entry['id']})
        self.assertEqual(personal.context(),'')

    def test_invalid_dates_and_preferences_do_not_write(self):
        with self.assertRaises(ValueError):personal.handle('/api/personal/task/add',{'title':'X','due':'morgen'})
        with self.assertRaises(ValueError):personal.handle('/api/personal/preferences',{'tone':'other'})
        self.assertFalse(self.file.exists())

    def test_priority_sender_rules_are_exact(self):
        personal.handle('/api/personal/preferences',{'tone':'kurz','priority_senders':['@example.com']})
        mail={'sender':'Team <a@example.com>','subject':'Hallo','snippet':'Text','category':'sonstige'}
        self.assertEqual(accounts.prioritized(dict(mail))['category'],'prioritaet')
        mail['sender']='a@evil-example.com'
        self.assertEqual(accounts.prioritized(dict(mail))['category'],'sonstige')

    def test_memory_plan_needs_one_use_confirmation(self):
        proposal=actions.handle('/api/assistant/plan',{'text':'Merke dir: Ich mag kurze Antworten.'},MagicMock())
        self.assertEqual(personal.load()['memories'],[])
        actions.handle('/api/assistant/confirm',{'confirmation':proposal['confirmation']},MagicMock())
        self.assertEqual(len(personal.load()['memories']),1)
        with self.assertRaises(ValueError):actions.handle('/api/assistant/confirm',{'confirmation':proposal['confirmation']},MagicMock())

    def test_task_plan_is_only_a_proposal(self):
        result=actions.handle('/api/assistant/plan',{'text':'Notiere als Aufgabe: morgen Werkstatt anrufen'},MagicMock())
        self.assertEqual(result['kind'],'task');self.assertTrue(result['payload']['due'])
        self.assertFalse(personal.load()['tasks'])

    def test_simple_event_needs_no_model_and_writes_nothing(self):
        generate=MagicMock()
        result=actions.handle('/api/assistant/plan',{'text':'Trag morgen um 15 Uhr einen Werkstatttermin ein'},generate)
        self.assertEqual(result['kind'],'event');self.assertEqual(result['fields']['title'],'Werkstatttermin')
        self.assertEqual(datetime.fromisoformat(result['fields']['start']).hour,15)
        generate.assert_not_called();self.assertFalse(accounts.PENDING_EVENTS)

    def test_explicit_end_time_and_calendar_hint(self):
        result=actions.local_event('Trag morgen um 15 Uhr bis 18 Uhr Kino in Kalender Privat ein',datetime.now(accounts.BERLIN))
        self.assertEqual(result['duration_minutes'],180)
        self.assertEqual(result['calendar_name'],'Privat')
        self.assertEqual(result['title'],'Kino')

    def test_ambiguous_or_nonexistent_clock_is_rejected(self):
        for day in ('2027-03-28','2027-10-31'):
            with self.assertRaises(ValueError):actions.event_fields({'title':'X','date':day,'time':'02:30','duration_minutes':60})

    def test_unrelated_request_has_no_action(self):
        value=actions.handle('/api/assistant/plan',{'text':'Erkläre mir, wie ein Kalender funktioniert'},MagicMock(return_value='{}'))
        # No actual write even if the phrase is interpreted as an incomplete proposal.
        self.assertIn(value['kind'],('none',))

    @patch.object(accounts,'Keychain',Vault)
    @patch.object(accounts,'ICloud')
    def test_conflict_needs_acknowledgement_and_recheck(self,cloud):
        cloud.return_value.calendars.return_value=[self.calendar]
        busy={'title':'Anderer Termin','start':self.event['start'],'end':self.event['end'],'calendar':'Privat'}
        cloud.return_value.events.return_value={'events':[busy],'warnings':[]}
        result=accounts.handle('/api/calendar/preview',self.event,MagicMock())
        self.assertEqual(len(result['event']['conflicts']),1)
        with self.assertRaises(accounts.ConnectionError):accounts.handle('/api/calendar/create',{'confirmation':result['confirmation']},MagicMock())
        cloud.return_value.create.assert_not_called()
        accounts.handle('/api/calendar/create',{'confirmation':result['confirmation'],'ack_conflicts':True},MagicMock())
        cloud.return_value.create.assert_called_once()

    @patch.object(accounts,'Keychain',Vault)
    @patch.object(accounts,'ICloud')
    def test_changed_conflicts_invalidate_preview(self,cloud):
        cloud.return_value.calendars.return_value=[self.calendar]
        cloud.return_value.events.return_value={'events':[],'warnings':[]}
        result=accounts.handle('/api/calendar/preview',self.event,MagicMock())
        cloud.return_value.events.return_value={'events':[{'title':'Neu','start':self.event['start']}],'warnings':[]}
        with self.assertRaisesRegex(accounts.ConnectionError,'geändert'):
            accounts.handle('/api/calendar/create',{'confirmation':result['confirmation']},MagicMock())
        cloud.return_value.create.assert_not_called()

    def test_cancellation_isolated_and_cleaned_up(self):
        identifier=jobs.begin('a'*32)
        self.assertTrue(jobs.is_busy());jobs.cancel('b'*32);jobs.check()
        jobs.cancel(identifier)
        with self.assertRaises(jobs.Cancelled):jobs.check()
        jobs.finish(identifier);self.assertFalse(jobs.is_busy());jobs.check()

    @patch.object(server.urllib.request,'urlopen')
    def test_model_stream_honors_cancellation(self,urlopen):
        identifier=jobs.begin('c'*32)
        response=MagicMock()
        def chunks():
            yield b'{"message":{"content":"Erster Teil"},"done":false}\n'
            jobs.cancel(identifier)
            yield b'{"message":{"content":"Nie anzeigen"},"done":true}\n'
        response.__iter__.side_effect=chunks
        urlopen.return_value.__enter__.return_value=response
        try:
            with self.assertRaises(jobs.Cancelled):server.ollama('chat',{'stream':False,'messages':[]})
            payload=json.loads(urlopen.call_args.args[0].data)
            self.assertTrue(payload['stream'])
            urlopen.return_value.__exit__.assert_called_once()
        finally:jobs.finish(identifier)

    def test_missing_and_stale_updater_status_not_reported_live(self):
        path=Path(self.temp.name)/'status.json'
        with patch.object(diagnostics,'UPDATE_STATE',path):
            self.assertFalse(diagnostics.status()['updater']['fresh'])
            path.write_text(json.dumps({'time':0,'message':'Updates aktiv'}))
            self.assertFalse(diagnostics.status()['updater']['fresh'])


if __name__=='__main__':unittest.main()
