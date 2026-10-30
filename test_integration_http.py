import http.client
import io
import json
import threading
import unittest
from unittest.mock import patch

import server


class HTTPTests(unittest.TestCase):
    def test_online_voice_endpoints_require_session_token(self):
        for path, data in [('/api/assistant/calendar', {'text':'Erstelle morgen 15 Uhr Zahnarzttermin','request_id':'a'*32}),('/api/voice/config', {'action': 'status'}),
                           ('/api/speech', {'voice': 'marin', 'text': 'Hallo', 'rate': 1})]:
            status, _ = self.request('POST', path, data)
            self.assertEqual(status, 403)

    def test_marin_stream_is_binary_and_uses_existing_auth(self):
        with patch('online_voice.open_audio', return_value=io.BytesIO(b'\x00\x01' * 9000)) as audio:
            status, body = self.request('POST', '/api/speech',
                {'voice': 'marin', 'text': 'Hallo Samet', 'rate': 1}, token=server.TOKEN)
        self.assertEqual(status, 200)
        self.assertEqual(body, b'\x00\x01' * 9000)
        audio.assert_called_once_with('Hallo Samet', 1)

    @classmethod
    def setUpClass(cls):
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()

    def request(self, method, path, data=None, token=None, origin=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port)
        headers={'Host':'127.0.0.1:8765','Content-Type':'application/json'}
        if token:headers['X-Jarvis-Token']=token
        if origin:headers['Origin']=origin
        conn.request(method,path,json.dumps(data).encode() if data is not None else None,headers)
        response=conn.getresponse();body=response.read();status=response.status;conn.close()
        return status,body

    @patch('integrations.handle')
    def test_connections_require_token(self, handle):
        status,_=self.request('POST','/api/connections/save',{'password':'test'})
        self.assertEqual(status,403);handle.assert_not_called()

    @patch('integrations.handle')
    def test_foreign_origin_rejected(self,handle):
        status,_=self.request('POST','/api/calendar/create',{},server.TOKEN,'https://evil.invalid')
        self.assertEqual(status,403);handle.assert_not_called()

    @patch('integrations.handle',return_value={'icloud':{'connected':False}})
    def test_authenticated_router(self,handle):
        status,body=self.request('POST','/api/connections/status',{},server.TOKEN,'http://127.0.0.1:8765')
        self.assertEqual(status,200);self.assertFalse(json.loads(body)['icloud']['connected'])
        handle.assert_called_once()

    def test_assets_and_no_get_for_secrets(self):
        self.assertEqual(self.request('GET','/organizer.js')[0],200)
        self.assertEqual(self.request('GET','/api/connections/status')[0],404)


if __name__=='__main__':unittest.main()

