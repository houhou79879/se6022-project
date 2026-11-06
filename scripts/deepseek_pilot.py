"""Bounded DeepSeek exploit pilot for the staged attack variants.

Paid API calls are refused unless --confirm is passed. Nothing is fabricated:
every row is the measured result of one fresh session, and failures are kept in
the output. Run ``--dry-run`` to see the plan without touching the network.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fileagent.attack_variants import VARIANTS, patch_for  # noqa: E402
from fileagent.engine import Lab  # noqa: E402
from fileagent.scenarios import scenario  # noqa: E402


def load_dotenv():
    """Match server.py: read only the two DeepSeek settings, never print them."""
    env_file = ROOT / '.env'
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding='utf-8-sig').splitlines():
        name, separator, value = line.partition('=')
        name = name.strip()
        if separator and name in {'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'} and value.strip():
            os.environ.setdefault(name, value.strip())


def plan(cases, wanted=None):
    rows = []
    for case_id in cases:
        items = VARIANTS[case_id]
        rows.extend((case_id, item['id']) for item in items
                    if wanted is None or item['id'] in wanted)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases', default='V1,V5,V7', help='comma separated case ids')
    parser.add_argument('--variant', default=None, help='comma separated variant ids')
    parser.add_argument('--dry-run', action='store_true', help='print the plan, no API calls')
    parser.add_argument('--confirm', action='store_true', help='allow the paid API calls')
    parser.add_argument('--runs', type=int, default=1, help='repeat each variant N times')
    parser.add_argument('--out', default=None, help='evidence JSON path (default tmp/)')
    args = parser.parse_args()
    load_dotenv()

    cases = [x.strip().upper() for x in args.cases.split(',') if x.strip()]
    missing = [c for c in cases if c not in VARIANTS]
    if missing:
        parser.error('no staged variant for: ' + ','.join(missing))
    wanted = [x.strip() for x in args.variant.split(',') if x.strip()] if args.variant else None
    rows = plan(cases, wanted)
    if not rows:
        parser.error('no variant matched the selection')

    if args.dry_run:
        print('Planned variants (each on a fresh vulnerable DeepSeek session):')
        for case_id, variant_id in rows:
            print(f'  {case_id}: {variant_id}')
        print('Budget per chat: at most 8 model calls / 90 s. V5 runs two chats plus one clean control.')
        print('V3/V4/V6 executor-only controls are not part of this pilot.')
        print('No API calls made; re-run with --confirm to execute.')
        return 0

    if not args.confirm:
        print('Refusing paid API calls without --confirm. Use --dry-run to inspect the plan.')
        return 2
    if not os.getenv('DEEPSEEK_API_KEY', '').strip():
        print('DEEPSEEK_API_KEY is not configured; nothing was run.')
        return 2

    out = Path(args.out) if args.out else ROOT / 'tmp' / f'deepseek-pilot-{time.strftime("%Y%m%d-%H%M%S")}.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    lab = Lab(ROOT / 'tmp' / 'pilot-runtime')
    results = []
    for run_index in range(max(1, args.runs)):
        for case_id, variant_id in rows:
            session = lab.create(user='alice', mode='vulnerable', backend='deepseek')
            started = time.time()
            with patch.dict(scenario(case_id), patch_for(case_id, variant_id)):
                result = lab.run_case(session, case_id)
            row = {
                'case': case_id,
                'variant': variant_id,
                'run': run_index + 1,
                'session_id': session.id,
                'model': session.model,
                'status': result['status'],
                'attack_success': result.get('attack_success'),
                'observed_attempts': result.get('observed_attempts'),
                'denied_calls': result.get('denied_calls'),
                'calls': session.calls,
                'model_calls': session.model_calls,
                'usage': session.usage,
                'seconds': round(time.time() - started, 1),
                'evidence': (result.get('evidence') or '')[:1500],
                'memory_evidence': result.get('memory_evidence'),
            }
            results.append(row)
            out.write_text(json.dumps({'backend': 'deepseek', 'time': time.time(), 'rows': results},
                                      ensure_ascii=False, indent=2), encoding='utf-8')
            print(f"run {run_index + 1} {case_id} {variant_id}: status={row['status']} "
                  f"attack_success={row['attack_success']} calls={row['calls']} "
                  f"model_calls={row['model_calls']} {row['seconds']}s")
    print('Measured evidence (failures included):', out)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
