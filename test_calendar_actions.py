"""Offline execution tests: no real calendars, credentials or model calls."""
import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import assistant_actions as actions
import calendar_action as executor
import integrations as accounts
import personal


class CalendarActionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        folder=Path(self.temp.name)
        self.file=folder/'receipts.json'
        for target,name,value in [(executor,'FILE',self.file),(personal,'FILE',folder/'preferences.json')]:
            p=patch.object(target,name,value);p.start();self.addCleanup(p.stop)
        self.vault=patch.object(accounts,'Keychain');self.key=self.vault.start();self.addCleanup(self.vault.stop)
        self.key.return_value.get.return_value={'email':'test@example.invalid','password':'test-app-password'}
        p=patch.object(accounts,'ICloud');self.cloud=p.start().return_value;self.addCleanup(p.stop)
        self.calendar={'id':'https://p01-caldav.icloud.com/123/private/','name':'Arbeit','writable':True}
        self.cloud.calendars.return_value=[self.calendar]
        self.cloud.events.return_value={'events':[],'warnings':[]}
        self.generate=MagicMock()

    def run_order(self,text='Erstelle mir ein Termin für morgen 15 Uhr beim Zahnarzt',request_id='a'*32):
        return actions.handle('/api/assistant/calendar',{'text':text,'request_id':request_id},self.generate)

    def test_exact_user_sentence_creates_real_typed_action_without_model(self):
        result=self.run_order()
        self.assertEqual(result['kind'],'calendar_saved')
        event=self.cloud.create.call_args.args[0]
        self.assertEqual(event['title'],'Zahnarzt')
        start=datetime.fromisoformat(event['start']);end=datetime.fromisoformat(event['end'])
        self.assertEqual(start.hour,15)
        self.assertEqual(start.date(),(datetime.now(accounts.BERLIN)+timedelta(days=1)).date())
        self.assertEqual(end-start,timedelta(hours=1))
        self.generate.assert_not_called()
        self.assertIn('In iCloud eingetragen',result['message'])
        self.assertEqual(self.file.stat().st_mode&0o777,0o600)
        self.assertNotIn('test-app-password',self.file.read_text())

    def test_minutes_and_explicit_duration_are_not_overwritten(self):
        result=self.run_order('Erstelle morgen 15:30 einen Zahnarzttermin für 30 Minuten')
        event=result['event']
        self.assertEqual(datetime.fromisoformat(event['start']).minute,30)
        self.assertEqual(datetime.fromisoformat(event['end'])-datetime.fromisoformat(event['start']),timedelta(minutes=30))
        self.assertNotIn('60 Minuten',result['message'])

    def test_missing_time_does_not_fall_through_to_repeating_chat(self):
        result=self.run_order('Erstelle morgen einen Termin beim Zahnarzt')
        self.assertEqual(result['kind'],'calendar_clarify');self.generate.assert_not_called();self.cloud.create.assert_not_called()

    def test_invalid_hour_never_writes(self):
        with self.assertRaises(ValueError):self.run_order('Erstelle morgen 25 Uhr Zahnarzttermin')
        self.cloud.create.assert_not_called()

    def test_exact_short_user_sentence_uses_tomorrow_without_model(self):
        result=self.run_order('Termin 15 Uhr morgen mit Samet')
        self.assertEqual(result['kind'],'calendar_saved')
        start=datetime.fromisoformat(result['event']['start'])
        self.assertEqual(start.date(),(datetime.now(accounts.BERLIN)+timedelta(days=1)).date())
        self.assertEqual(start.hour,15)
        self.assertEqual(result['event']['title'],'mit Samet')
        self.generate.assert_not_called();self.cloud.create.assert_called_once()

    def test_short_entry_without_date_clarifies_instead_of_chat(self):
        self.assertEqual(self.run_order('Termin 15 Uhr mit Samet')['kind'],'calendar_clarify')
        self.generate.assert_not_called();self.cloud.create.assert_not_called()

    def test_missing_icloud_is_an_actionable_setup_result(self):
        self.key.return_value.get.return_value=None
        self.assertEqual(self.run_order()['kind'],'calendar_setup')
        self.cloud.create.assert_not_called();self.assertFalse(self.file.exists())

    def test_missing_or_duplicate_work_calendar_never_uses_another_calendar(self):
        for calendars in [[{**self.calendar,'name':'Privat'}],[self.calendar,{**self.calendar,'id':self.calendar['id']+'other/'}]]:
            self.cloud.calendars.return_value=calendars
            self.assertEqual(self.run_order()['kind'],'calendar_unavailable')
        self.cloud.create.assert_not_called()

    def test_work_calendar_overrides_old_default_and_hint(self):
        private={**self.calendar,'id':self.calendar['id']+'private/','name':'Privat'}
        self.cloud.calendars.return_value.append(private)
        personal.handle('/api/personal/preferences',{'tone':'kurz','default_calendar':private['id']})
        result=self.run_order('Erstelle morgen 15 Uhr Zahnarzt in meinem Kalender Privat')
        self.assertEqual(result['event']['calendar_id'],self.calendar['id'])
        self.assertEqual(result['event']['calendar'],'Arbeit')
        self.assertEqual(result['event']['title'],'Zahnarzt')

    def test_conflicts_do_not_require_second_confirmation(self):
        self.cloud.events.return_value={'events':[{'title':'Anderer Termin'}],'warnings':[]}
        result=self.run_order()
        self.assertEqual(result['kind'],'calendar_saved')
        self.assertIn('überschneidet',result['message'])
        self.cloud.create.assert_called_once()

    def test_incomplete_conflict_check_is_only_a_notice(self):
        self.cloud.events.return_value={'events':[],'warnings':['Kalender unvollständig']}
        result=self.run_order()
        self.assertEqual(result['kind'],'calendar_saved')
        self.assertIn('unvollständig',result['message'])
        self.cloud.create.assert_called_once()

    def test_unknown_write_status_never_claims_success_or_retries(self):
        self.cloud.create.side_effect=accounts.ConnectionError('Zeitlimit')
        first=self.run_order()
        self.assertEqual(first['kind'],'calendar_uncertain')
        self.assertEqual(self.run_order()['kind'],'calendar_uncertain')
        self.assertEqual(self.run_order(request_id='b'*32)['kind'],'calendar_uncertain')
        self.assertEqual(self.cloud.create.call_count,1)
        self.assertNotIn('In iCloud eingetragen',first['message'])

    def test_successful_order_is_not_duplicated_after_retry_or_reload(self):
        self.assertEqual(self.run_order()['kind'],'calendar_saved')
        self.assertEqual(self.run_order()['kind'],'calendar_saved')
        self.assertEqual(self.run_order(request_id='b'*32)['kind'],'calendar_saved')
        self.assertEqual(self.cloud.create.call_count,1)

    def test_changed_request_id_payload_is_rejected(self):
        self.run_order()
        with self.assertRaises(ValueError):self.run_order('Erstelle morgen 17 Uhr einen Arzttermin')
        self.assertEqual(self.cloud.create.call_count,1)

    def test_negation_and_recurring_intent_never_create_single_event(self):
        for text in ['Erstelle morgen 15 Uhr keinen Zahnarzttermin','Erstelle jeden Montag 15 Uhr einen Zahnarzttermin','Erstelle morgen 15 Uhr oder 16 Uhr einen Zahnarzttermin','Erstelle morgen 15 Uhr Zahnarzt und 17 Uhr Frisörtermin']:
            self.assertEqual(self.run_order(text)['kind'],'calendar_clarify')
        self.cloud.create.assert_not_called()

    def test_calendar_outage_does_not_claim_success(self):
        self.cloud.calendars.side_effect=accounts.ConnectionError('iCloud ist nicht erreichbar.')
        self.assertEqual(self.run_order()['kind'],'calendar_unavailable')
        self.cloud.create.assert_not_called()


if __name__=='__main__':unittest.main()
