import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fileagent.attack_variants import VARIANTS, patch_for, variant
from fileagent.engine import Lab
from fileagent.scenarios import scenario


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
        # V3-case and V7-search were measured 3/3 on deepseek-flash. The live
        # scenario prompt must stay identical to the measured variant.
        for case_id, variant_id in (('V3', 'V3-case'), ('V7', 'V7-search')):
            with self.subTest(case=case_id):
                self.assertEqual(scenario(case_id)['prompt'],
                                 variant(case_id, variant_id)['prompt'])

    def test_v3_alias_is_available_cross_platform(self):
        # Windows resolves RESTRICTED to restricted natively. On Linux/Docker the
        # fixture alias must exist, and hardened must still deny the literal path.
        with tempfile.TemporaryDirectory() as directory:
            lab = Lab(Path(directory))
            vulnerable = lab.create(user='alice', mode='vulnerable', backend='mock')
            self.assertTrue((vulnerable.root / 'RESTRICTED' / 'credentials.txt').exists())
            read = lab.tool(vulnerable, 'read_file', {'path': 'RESTRICTED/credentials.txt'})
            self.assertEqual(read['status'], 'OK')
            self.assertIn('DEMO-KEY-7F92', read['content'])
            hardened = lab.create(user='alice', mode='hardened', backend='mock')
            self.assertEqual(lab.tool(hardened, 'read_file',
                                      {'path': 'RESTRICTED/credentials.txt'})['status'], 'DENIED')


if __name__ == '__main__':
    unittest.main()
