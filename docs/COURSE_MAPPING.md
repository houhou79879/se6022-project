# Course mapping and evidence contract

Sources: materials/week-07.pdf through week-11.pdf; Week 10 and Week 11 notebooks, and the two assignment photographs. The final rubric and Starter Kit were not supplied. Existing materials do not prove that every chosen system must reproduce all classifier algorithms.

## Week 10

Deploy → baseline → injection → jailbreak variants → retrieval poisoning → tool misuse → automated battery → structured stateful campaigns → OWASP table → mitigation/retest. FileAgent implements real files and the same replayable test/evidence loop. It does not claim installed garak or PyRIT execution. External scanner integration remains an extension; fixed scenarios are labeled built-in. A tool-output variant (V7 `search_files` result) is measured in `docs/DEEPSEEK_VARIANTS.md`; encoding variants and large held-out sets remain research expansion tasks.

Unlike the teaching mock, hardened FileAgent retains legal read/search/write functionality. Approval actually executes the authorized exact change and rejects replay/substitution. A mock seed corpus is evidence about executor behavior, not the natural-language robustness of a real LLM.

## Week 11 phases

1 Deploy: bounded model adapters and real sandbox tools.
2 Posture: evidence-backed release checklist, not manually enabled booleans.
3 Robustness: empirical seeded Agent attacks; certified robustness N/A for this LLM application (no misleading smoothing claim).
4 Guardrails: model instructions/source handling, execution authorization, output redaction and escaped text rendering.
5 Provenance: Ed25519 signed application tool manifest; actual clean verify, tamper rejection and reinstall. Not OpenSSF OMS and not model-weight signing.
6 Monitoring: per-call results, bytes, calls, timing, alerts and JSONL evidence.
7 Drift: controlled measured request-call distributions; two-sample KS statistic with seeded permutation p-value and PSI. No LLM confidence is invented.
8 Red-team: eight root causes with per-case oracles; V3/V4/V6 control-level versus other Agent tasks.
9 Remediate: three configurations, independent retest and normal-task smoke; pause and snapshot recovery.
10 Report: generated Markdown/JSON/CSV and NIST-mapped GO/NO-GO gate. Missing evidence blocks.

## NIST AI RMF

GOVERN: scope, four owners, risk register and non-compensable gates.
MAP: actors, entry points, assets and trust boundaries.
MEASURE: per-case damage, tool attempts, normal-task outcome, overhead, integrity checks and drift.
MANAGE: hardening, pause/isolation, cleanup/recovery and release review.

## Six reflection drafts

1 Lifecycle: retrieval authorization sits before context assembly; release verification sits before application manifest loading. They address different trust transitions and do not replace each other.
2 Assurance: these attacks test known paths and yield empirical evidence. A finite corpus provides no theorem about all prompts; no certification or DP budget is claimed.
3 Layers: context handling reduces induced requests, authorization rejects disallowed resources, output checks reduce accidental disclosure. Legitimate-but-out-of-scope requests within a user's own writable space remain difficult; explicit approval reduces that risk at a usability cost.
4 Provenance: a real signature binds the manifest bytes to a trusted signer. A malicious artifact signed by that signer can still be malicious, so behavior tests and review remain necessary; model weights are not covered here.
5 Continuous assurance: traffic shift triggers investigation and revalidation. If changing prompts, tools or models, review data/source provenance, rerun attacks and legal tasks, validate release identity and re-gate before deployment. No automatic retraining is claimed.
6 Governance: each gate consumes concrete results and exposes NOT_RUN. A failed confidentiality case cannot be balanced away by a high posture score. The final GO is limited to the declared laboratory scope and requires explicit residual-risk documentation.

## Research expansion before final submission

Add held-out natural-language variants, repeat DeepSeek cases under fixed settings, increase benign tasks and per-layer ablations, pin tool/library/model versions, define confidence intervals, and review the final instructor rubric. Do not copy example notebook ASR or model scores into results. A single malicious link string is not confirmed exfiltration; simple output masking is not DP; retrieval leakage is not MIA.
