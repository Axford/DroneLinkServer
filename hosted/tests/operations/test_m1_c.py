import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'tools/operations'))
import m1_c


class M1CApprovalBoundary(unittest.TestCase):
    def test_changed_original_record_stops_preservation_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'preservation-before.json').write_text(json.dumps([{'name': 'original', 'fieldsSha256': 'before'}]))
            with patch.object(m1_c, 'ROOT', root), patch.object(m1_c, 'hashes', return_value=[{'name': 'original', 'fieldsSha256': 'after'}]):
                with self.assertRaisesRegex(RuntimeError, 'hashes changed'):
                    m1_c.preserve()
            self.assertFalse((root / 'preservation-after.json').exists())

    def test_index_mutations_are_exactly_the_four_approved_exemptions(self):
        calls = []
        def config(group, field):
            updated = any('--collection-group=' + group in command and field in command for command in calls)
            return {'indexConfig': {'indexes': [] if updated else [{'order': 'ASCENDING'}], 'usesAncestorConfig': not updated}}
        with patch.object(m1_c, 'validate'), patch.object(m1_c, 'field_config', config), patch.object(m1_c.subprocess, 'run', side_effect=lambda command, **kwargs: calls.append(command)), patch.object(m1_c, 'output') as output:
            m1_c.indexes()
        self.assertEqual(len(calls), 4)
        self.assertEqual({(command[6].split('=', 1)[1], command[5]) for command in calls}, set(m1_c.FIELDS))
        for command in calls:
            self.assertIn('--project=dronelink-25dbc', command)
            self.assertIn('--disable-indexes', command)
            self.assertFalse(any('ttl' in part.lower() for part in command))
        output.assert_called_once()

    def test_altered_release_blocks_deployment_before_cloud_command(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'hosted-release.json').write_text('{}')
            with patch.object(m1_c, 'RELEASE', root), patch.object(m1_c.subprocess, 'run') as run:
                with self.assertRaisesRegex(RuntimeError, 'hash differs'):
                    m1_c.deploy()
                run.assert_not_called()
