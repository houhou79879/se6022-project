# FileAgent implementation plan — 2026-11-04

Goal: deliver the approved local-only FileAgent demo with eight isolated root causes plus V4A/V6A Agent-level variants, three policies, mock/DeepSeek backends, real sandbox tools, approvals, audit, recovery and evidence exports.

Architecture: Python HTTP service; isolated per-session real filesystem; shared policy/tool executor; deterministic and DeepSeek adapters; buildless HTML/CSS/JS dashboard. Local operator selects simulated employee identity, not production authentication. No cloud publication.

Tasks (execute inline):
- [x] Write behavioral unittest cases for containment, cross-user retrieval, approval binding, memory isolation, signing, budgets, restoration, evaluation and missing API credentials; observe initial failure.
- [x] Implement fixtures/scenarios, execution/policy, signing and audit persistence. Tools can never escape session sandbox even in vulnerable mode.
- [x] Implement interchangeable model adapters and bounded agent loop. DeepSeek HTTP errors remain errors; no silent fallback; all tool calls use shared executor.
- [x] Implement ten case-specific oracles (eight root causes plus V4A/V6A) and before/after evaluation, snapshots, alert/response and evidence-based report gate. Distinguish end-to-end versus control-level tests.
- [x] Implement localhost API and interactive dashboard: chat, scenario loading, file browser, traces, action approval, monitoring, report exports.
- [x] Add ten-phase notebook, team/threat model documentation, launch scripts and usage instructions.
- [x] Run security regression suite, HTTP checks and browser QA; fix observed defects; leave working local demo running.

Verification: python -m unittest discover -s tests -v; python scripts/evaluate.py; HTTP smoke and browser interactions. Real DeepSeek live validation requires DEEPSEEK_API_KEY; missing key is explicitly NOT_RUN. No result is invented.

