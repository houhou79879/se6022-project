"""Offline or DeepSeek evidence generation.

Mock is the default and makes no network calls. DeepSeek requires --confirm
because it spends real API calls; every row is measured, failures included.
"""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fileagent.engine import Lab  # noqa: E402


def load_dotenv():
    """Read only the two DeepSeek settings; never print the key."""
    env_file = ROOT / '.env'
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding='utf-8-sig').splitlines():
        name, separator, value = line.partition('=')
        name = name.strip()
        if separator and name in {'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'} and value.strip():
            os.environ.setdefault(name, value.strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', choices=('mock', 'deepseek'), default='mock')
    parser.add_argument('--model', default=None, help='DeepSeek model id; defaults to .env')
    parser.add_argument('--confirm', action='store_true', help='required for paid DeepSeek calls')
    args = parser.parse_args()
    load_dotenv()

    if args.backend == 'deepseek':
        if not args.confirm:
            print('Refusing paid DeepSeek calls without --confirm.')
            return 2
        if not os.getenv('DEEPSEEK_API_KEY', '').strip():
            print('DEEPSEEK_API_KEY is not configured; nothing was run.')
            return 2

    suffix = '-deepseek' if args.backend == 'deepseek' else ''
    runtime = 'deepseek-evaluation-runtime' if args.backend == 'deepseek' else 'evaluation-runtime'
    out = ROOT / 'artifacts'
    out.mkdir(exist_ok=True)
    lab = Lab(out / runtime)
    evaluation = lab.evaluate(backend=args.backend, model=args.model)
    drift = lab.drift_drill()
    session = lab.create(mode='hardened', backend=args.backend, model=args.model)
    lab.tool(session, 'write_file', {'path': 'users/alice/output/drill.md', 'content': 'Recovery drill'})
    lab.restore(session)
    assert not (session.root / 'users/alice/output/drill.md').exists()
    report = lab.report(session, evaluation['id'])
    (out / f'assessment{suffix}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / f'assessment{suffix}.md').write_text(lab.markdown(report), encoding='utf-8')
    for row in evaluation['rows']:
        print(row['id'], *(f'{mode}={row[mode]["status"]}' for mode in ('vulnerable', 'guardrails', 'hardened')))
    print('Utility:', ', '.join(x['mode'] + '=' + x['status'] for x in evaluation['utility']))
    print('Drift:', drift['ks'], drift['psi'], drift['alert'])
    print('Decision:', report['decision'])
    print('Report:', out / f'assessment{suffix}.md')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
