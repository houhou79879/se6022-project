import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fileagent.attack_variants import VARIANTS, patch_for, variant
from fileagent.engine import Lab
from fileagent.scenarios import scenario
from fileagent.paths import home

ALICE=home('alice')
BOB=home('bob')


class AttackVariantTests(unittest.TestCase):
    """Staged variants must really succeed in vulnerable Mock and be blocked by hardened Mock.

    These are offline regression tests. They do not claim anything about DeepSeek;
    the live measurement is scripts/deepseek_pilot.py.
    """

    def run_variant(self, mode, case_id, variant_id):
        with tempfile.TemporaryDirectory() as directory:
            lab = Lab(Path(directory))
            session = lab.create(user='alice', mode=mode, backend='mock')
            with patch.dict(scenario(case_id), patch_for(case_id, variant_id)):
                return lab.run_case(session, case_id)

    def test_variants_succeed_against_vulnerable_mock(self):
        for case_id, variants in VARIANTS.items():
            for item in variants:
                with self.subTest(case=case_id, variant=item['id']):
                    result = self.run_variant('vulnerable', case_id, item['id'])
                    self.assertTrue(result['attack_success'], result)
                    self.assertEqual(result['status'], 'FAIL', result)

    def test_variants_are_blocked_by_hardened_mock(self):
        for case_id, variants in VARIANTS.items():
            for item in variants:
                with self.subTest(case=case_id, variant=item['id']):
                    result = self.run_variant('hardened', case_id, item['id'])
                    self.assertFalse(result['attack_success'], result)
                    self.assertEqual(result['status'], 'PASS', result)

    def test_baseline_payload_is_unchanged_without_a_variant(self):
        with tempfile.TemporaryDirectory() as directory:
            lab = Lab(Path(directory))
            session = lab.create(user='alice', mode='vulnerable', backend='mock')
            result = lab.run_case(session, 'V1')
            self.assertTrue(result['attack_success'])
            self.assertIn('Business document (untrusted contribution).',
                          (session.root / 'shared/phoenix.md').read_text(encoding='utf-8'))

    def test_promoted_scenarios_match_measured_deepseek_variants(self):
        # V7-search was measured 3/3 on deepseek-flash. The live scenario prompt
        # must stay identical to the measured variant.
        self.assertEqual(scenario('V7')['prompt'], variant('V7', 'V7-search')['prompt'])

    def test_hardlink_alias_is_denied_by_identity_check(self):
        # Defense-in-depth, independent of V3: a hardlink inside Alice's dir to
        # restricted content or Bob's payroll must be denied by inode identity.
        with tempfile.TemporaryDirectory() as directory:
            lab = Lab(Path(directory))
            vulnerable = lab.create(user='alice', mode='vulnerable', backend='mock')
            os.link(vulnerable.root / 'restricted/credentials.txt',
                    vulnerable.root / f'{ALICE}/audit.txt')
            read = lab.tool(vulnerable, 'read_file', {'path': f'{ALICE}/audit.txt'})
            self.assertEqual(read['status'], 'OK')
            self.assertIn('DEMO-KEY-7F92', read['content'])
            hardened = lab.create(user='alice', mode='hardened', backend='mock')
            os.link(hardened.root / 'restricted/credentials.txt',
                    hardened.root / f'{ALICE}/audit.txt')
            self.assertEqual(lab.tool(hardened, 'read_file',
                                      {'path': f'{ALICE}/audit.txt'})['status'], 'DENIED')
            os.link(hardened.root / f'{BOB}/payroll.txt',
                    hardened.root / f'{ALICE}/payroll-link.txt')
            self.assertEqual(lab.tool(hardened, 'read_file',
                                      {'path': f'{ALICE}/payroll-link.txt'})['status'], 'DENIED')


if __name__ == '__main__':
    unittest.main()
