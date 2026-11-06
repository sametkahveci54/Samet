import ast
from pathlib import Path
import runpy
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

class InstallTest(unittest.TestCase):
    def test_preserves_current_server_and_repeat_install(self):
        with TemporaryDirectory() as temp:
            home = Path(temp)
            root = home / 'repo'
            (root / 'web').mkdir(parents=True)
            shutil.copy('../jarvis-feature/server.py', root / 'server.py')
            shutil.copy('../jarvis-feature/web/index.html', root / 'web/index.html')
            with patch('pathlib.Path.home', return_value=home), patch('subprocess.run'), patch.object(sys, 'argv', ['install.py', str(root)]):
                runpy.run_path('install.py', run_name='__main__')
                runpy.run_path('install.py', run_name='__main__')
            server = (root / 'server.py').read_text()
            ast.parse(server, feature_version=(3,9))
            self.assertEqual(server.count('start(HOST)'), 1)
            self.assertIn('from quick_calendar import create', server)
            self.assertIn('from document_library import handle', server)
            self.assertEqual((root / 'web/index.html').read_text().count('/bitcoin-link.js'), 1)
            self.assertEqual(len(list((home / 'Jarvis-Backups').iterdir())), 2)

if __name__ == '__main__':
    unittest.main()
