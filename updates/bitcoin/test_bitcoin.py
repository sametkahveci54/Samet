import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from datetime import datetime
import bitcoin_reports as app

class ReportsTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = patch.object(app, 'DIRECTORY', Path(self.temp.name))
        self.directory.start()
        self.addCleanup(self.directory.stop)

    def test_schedule_and_dst(self):
        for day, offset in [('2026-03-29', '+02:00'), ('2026-10-25', '+01:00')]:
            morning = datetime.fromisoformat(day + 'T09:00:00').replace(tzinfo=app.BERLIN)
            self.assertTrue(app.due_slot(morning).endswith(offset))
            self.assertIsNone(app.due_slot(morning.replace(hour=8, minute=59)))
            self.assertIsNone(app.due_slot(morning.replace(hour=11)))
            self.assertIsNotNone(app.due_slot(morning.replace(hour=10, minute=59)))
            self.assertIsNotNone(app.due_slot(morning.replace(hour=18)))

    def test_no_duplicate_and_no_old_report_on_subscription(self):
        with app.database() as conn:
            conn.execute('INSERT INTO devices VALUES(?,?,?)', ('old', '{}', '2026-11-05T10:00:00+01:00'))
            conn.execute('INSERT INTO devices VALUES(?,?,?)', ('new', '{}', '2026-11-06T10:00:00+01:00'))
        now = datetime(2026, 11, 6, 10, 1, tzinfo=app.BERLIN)
        with patch.object(app, 'market_report', return_value='test') as fetch, patch.object(app, 'push', return_value='accepted') as send:
            app.tick(now)
            app.tick(now)
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(send.call_count, 1)

    def test_source_failure_does_not_save_fake_report(self):
        with patch.object(app, 'market_report', side_effect=OSError):
            with self.assertRaises(OSError):
                app.tick(datetime(2026, 11, 6, 9, tzinfo=app.BERLIN))
        with app.database() as conn:
            self.assertEqual(conn.execute('SELECT count(*) FROM reports').fetchone()[0], 0)

    def test_forbids_local_push_endpoints(self):
        for endpoint in ('http://127.0.0.1/', 'https://example.com/', 'https://web.push.apple.com.evil.test/'):
            with self.assertRaises(ValueError):
                app.validate_subscription({'endpoint': endpoint})

    def test_market_calculation(self):
        from io import BytesIO
        data = {'last':'105', 'open':'100', 'low':'95', 'high':'110'}
        with patch('urllib.request.urlopen', return_value=BytesIO(json.dumps(data).encode())):
            text = app.market_report()
        self.assertIn('105,00 €', text)
        self.assertIn('+5.00%', text)
        self.assertIn('Coinbase', text)

if __name__ == '__main__':
    unittest.main()
