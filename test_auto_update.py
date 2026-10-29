import importlib.util
import plistlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import auto_update as updater
from install_auto_update import make_plist


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.remote = self.base / 'remote.git'
        self.author = self.base / 'author'
        self.client = self.base / 'client'
        self.run_git(self.base, 'init', '--bare', str(self.remote))
        self.run_git(self.base, 'init', '-b', 'main', str(self.author))
        self.run_git(self.author, 'config', 'user.email', 'test@example.invalid')
        self.run_git(self.author, 'config', 'user.name', 'Test')
        (self.author / 'server.py').write_text('print("working")\n')
        (self.author / 'auto_update.py').write_text('# supervisor\n')
        (self.author / '.gitignore').write_text('config.local.json\nNotizen/\n')
        self.commit('Initial')
        self.run_git(self.author, 'remote', 'add', 'origin', str(self.remote))
        self.run_git(self.author, 'push', '-u', 'origin', 'main')
        self.run_git(self.base, 'clone', '-b', 'main', str(self.remote), str(self.client))
        self.allowed = patch.object(updater, 'EXPECTED', {str(self.remote)})
        self.allowed.start()
        self.addCleanup(self.allowed.stop)

    @staticmethod
    def run_git(root, *args):
        return subprocess.run(['/usr/bin/git', '-C', str(root), *args],
                              check=True, capture_output=True, text=True).stdout.strip()

    def commit(self, message):
        self.run_git(self.author, 'add', '.')
        self.run_git(self.author, 'commit', '-m', message)

    def publish(self, name='server.py', content='print("updated")\n'):
        (self.author / name).write_text(content)
        self.commit('Update')
        self.run_git(self.author, 'push', 'origin', 'main')

    def test_no_update(self):
        old, new = updater.candidate(self.client)
        self.assertEqual(old, new)

    def test_update_and_rollback_preserve_private_files(self):
        (self.client / 'config.local.json').write_text('{"tailscale_host":"private"}')
        (self.client / 'Notizen').mkdir()
        note = self.client / 'Notizen/private.txt'
        note.write_text('private note')
        self.publish()
        old, new = updater.candidate(self.client)
        self.assertNotEqual(old, new)
        updater.git('merge', '--ff-only', new, root=self.client)
        self.assertIn('updated', (self.client / 'server.py').read_text())
        updater.restore(old, new, self.client)
        self.assertIn('working', (self.client / 'server.py').read_text())
        self.assertEqual(note.read_text(), 'private note')
        self.assertIn('private', (self.client / 'config.local.json').read_text())

    def test_local_edits_are_not_overwritten(self):
        self.publish()
        (self.client / 'server.py').write_text('# my edits\n')
        with self.assertRaisesRegex(RuntimeError, 'lokale Änderungen'):
            updater.candidate(self.client)
        self.assertEqual((self.client / 'server.py').read_text(), '# my edits\n')

    def test_untracked_files_pause_updates(self):
        (self.client / 'draft.py').write_text('# draft\n')
        with self.assertRaisesRegex(RuntimeError, 'lokale Änderungen'):
            updater.candidate(self.client)

    def test_invalid_python_is_not_applied(self):
        self.publish(content='def broken(:\n')
        with self.assertRaises(SyntaxError):
            updater.candidate(self.client)
        self.assertIn('working', (self.client / 'server.py').read_text())

    def test_dependency_change_requires_manual_install(self):
        self.publish('requirements-lock.txt', 'new-package==1\n')
        with self.assertRaisesRegex(RuntimeError, 'Abhängigkeiten'):
            updater.candidate(self.client)

    def test_other_branch_and_other_remote_are_rejected(self):
        self.run_git(self.client, 'checkout', '-b', 'work')
        with self.assertRaisesRegex(RuntimeError, 'main'):
            updater.candidate(self.client)
        self.run_git(self.client, 'remote', 'set-url', 'origin', '/wrong/repo')
        with self.assertRaisesRegex(RuntimeError, 'freigegebene'):
            updater.candidate(self.client)

    def test_divergence_is_not_force_merged(self):
        self.run_git(self.client, 'config', 'user.email', 'test@example.invalid')
        self.run_git(self.client, 'config', 'user.name', 'Test')
        (self.client / 'local.py').write_text('# local commit\n')
        self.run_git(self.client, 'add', '.')
        self.run_git(self.client, 'commit', '-m', 'Local work')
        self.publish()
        with self.assertRaises(RuntimeError):
            updater.candidate(self.client)
        self.assertTrue((self.client / 'local.py').exists())

    def test_rollback_refuses_new_edits(self):
        self.publish()
        old, new = updater.candidate(self.client)
        updater.git('merge', '--ff-only', new, root=self.client)
        (self.client / 'server.py').write_text('# later edit\n')
        with self.assertRaisesRegex(RuntimeError, 'blockiert'):
            updater.restore(old, new, self.client)
        self.assertEqual((self.client / 'server.py').read_text(), '# later edit\n')

    def test_launch_agent_paths_with_spaces(self):
        root = Path('/Users/Test User/My Jarvis')
        python = root / '.venv/bin/python'
        config = plistlib.loads(plistlib.dumps(make_plist(root, python, root / 'logs')))
        self.assertEqual(config['ProgramArguments'], [str(python), str(root / 'auto_update.py')])
        self.assertNotIn('sudo', str(config))


if __name__ == '__main__':
    unittest.main()
