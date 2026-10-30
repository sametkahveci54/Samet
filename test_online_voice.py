import io
import json
import unittest
import urllib.error
from unittest.mock import Mock, patch

import online_voice as voice


class OnlineVoiceTests(unittest.TestCase):
    @patch.object(voice, 'Keychain')
    def test_save_requires_consent_and_never_returns_secret(self, vault):
        key = 'sk-' + 'a' * 30
        with self.assertRaises(ValueError): voice.configure({'action': 'save', 'key': key})
        vault.return_value.set.assert_not_called()
        result = voice.configure({'action': 'save', 'key': key, 'consent': True})
        vault.return_value.set.assert_called_once_with('openai', {'key': key})
        self.assertNotIn(key, json.dumps(result))

    @patch.object(voice, 'Keychain')
    def test_status_never_reads_secret(self, vault):
        vault.return_value.find.return_value = (None, 123)
        self.assertEqual(voice.configure({}), {'configured': True})
        vault.return_value.find.assert_called_once_with('openai', read=False)
        vault.return_value.cf.CFRelease.assert_called_once_with(123)

    @patch.object(voice, 'Keychain')
    @patch.object(voice.urllib.request, 'urlopen')
    def test_missing_key_makes_no_api_request(self, remote, vault):
        vault.return_value.get.return_value = None
        with self.assertRaises(ValueError): voice.open_audio('Hallo', 1)
        remote.assert_not_called()

    @patch.object(voice, 'Keychain')
    @patch.object(voice.urllib.request, 'urlopen')
    def test_fixed_voice_and_professional_instructions(self, remote, vault):
        vault.return_value.get.return_value = {'key': 'sk-private-test'}
        voice.open_audio('Hallo Samet', 0.95)
        request = remote.call_args.args[0]
        self.assertEqual(request.full_url, 'https://api.openai.com/v1/audio/speech')
        data = json.loads(request.data)
        self.assertEqual(data['voice'], 'marin')
        self.assertEqual(data['model'], 'gpt-4o-mini-tts')
        self.assertEqual(data['response_format'], 'pcm')
        self.assertIn('professional', data['instructions'])
        self.assertEqual(data['input'], 'Hallo Samet')

    @patch.object(voice, 'Keychain')
    @patch.object(voice.urllib.request, 'urlopen')
    def test_provider_errors_do_not_leak_secrets(self, remote, vault):
        vault.return_value.get.return_value = {'key': 'sk-private-test'}
        remote.side_effect = urllib.error.HTTPError('https://api.openai.com', 429, 'sk-private-test', {}, io.BytesIO(b'sk-private-test'))
        with self.assertRaisesRegex(ValueError, 'Guthaben') as error:
            voice.open_audio('Hallo', 1)
        self.assertNotIn('sk-private', str(error.exception))

    def test_audio_is_flushed_in_chunks_without_json_wrapper(self):
        handler = Mock()
        handler.wfile = io.BytesIO()
        handler.wfile.flush = Mock()
        with patch.object(voice.jobs, 'check'):
            voice.stream_audio(handler, io.BytesIO(b'a' * 9000))
        self.assertEqual(handler.wfile.getvalue(), b'a' * 9000)
        self.assertGreater(handler.wfile.flush.call_count, 1)
        self.assertTrue(handler.close_connection)

    @patch.object(voice, 'Keychain')
    def test_remove_only_deletes_openai_credential(self, vault):
        self.assertFalse(voice.configure({'action': 'delete'})['configured'])
        vault.return_value.delete.assert_called_once_with('openai')


if __name__ == '__main__': unittest.main()
