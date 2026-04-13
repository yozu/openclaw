# Exec policy / isolated cron investigation notes

## Confirmed field facts (2026-04-13 JST)

### 1. Job JSON can say `execPolicy: { security: "full", ask: "off" }`, but isolated/manual reality still diverges

Observed jobs:

- `e5e1a907-8067-4554-b17c-2f159c050f6a` (`allowlist doctor`)
- `7714108a-3465-4e8d-b967-a57e6a07bc4d` (`cron doctor`)
- `50ab3fdc-973b-4923-8251-aa7791530a4e` (`comapサーバー監視・自動起動`)

All three had `sessionTarget: "isolated"`. At investigation time, job JSON for `allowlist doctor`, `cron doctor`, and `comap...` contained:

```json
"execPolicy": {
  "security": "full",
  "ask": "off"
}
```

Yet historical isolated/manual runs still produced behavior consistent with `security=allowlist ask=on-miss`.

### 2. There are at least two distinct failure classes, not one

#### A. Exec-policy forwarding/runtime mismatch class

Example job: `50ab3fdc-973b-4923-8251-aa7791530a4e`

Run log examples:

- `runAtMs: 1776054577863`
- `runAtMs: 1776064415101`

Both finished with summaries including:

```text
exec denied: Cron runs cannot wait for interactive exec approval.
Effective host exec policy: security=allowlist ask=on-miss askFallback=allowlist
```

This happened even though:

- `~/.openclaw/exec-approvals.json` had already been aligned to `security:"full", ask:"off"`
- `jobs.json` stored `payload.execPolicy: { security:"full", ask:"off" }`

#### B. Model-turn waste / timeout class

Example job: `e5e1a907-8067-4554-b17c-2f159c050f6a` (`allowlist doctor`)

This script is lightweight and usually completes in tens of seconds when the model executes the intended single command path.

Observed good run:

- `runAtMs: 1776069437098`
- `status: ok`
- `durationMs: 31234`
- session `047c0a3f-...`
- actual outcome: run script -> `NO_FINDINGS` -> `NO_REPLY`

Observed bad run:

- `runAtMs: 1776074534844`
- `status: error`
- `durationMs: 90260`
- `error: cron: job execution timed out`

Also observed a bad-but-finished model path:

- `runAtMs: 1776069819353`
- `status: ok`
- session `b13c96f1-...`
- summary reported exec denied because the model assembled a composite exec path that still fell into allowlist approval behavior

Conclusion: even after forwarding/approval fixes, a separate issue remains where isolated agent turns spend time on prompt/turn behavior instead of executing the narrow intended script path.

### 3. Heavy browser job timeout was a different class again

Example job: `b7b0adf1-83f2-47da-b311-2ef8289d1307` (`RTX 3090 / 3090 Ti / 4090 価格チェック`)

Before lightening:

- `runAtMs: 1776049200010` -> `status:error`, `durationMs: 899997`
- `runAtMs: 1776057697961` -> `status:error`, `durationMs: 900042`

After prompt/lightening changes:

- `timeoutSeconds: 600`
- manual run `runAtMs: 1776075523027`
- `status: ok`
- `durationMs: 183634`

This shows not every timeout is an exec-policy bug. Some are simply oversized browser-agent jobs.

## Local code investigation

In local workspace `openclaw-pr-fix`, a forwarding patch was added so isolated/manual cron payload exec policy reaches the embedded isolated agent executor:

- `src/cron/isolated-agent/run-executor.ts`
- `src/cron/types.ts`
- new test: `src/cron/isolated-agent/run.exec-policy-forwarding.test.ts`

Build verification confirmed bundled output contained:

```js
execOverrides: params.agentPayload?.execPolicy;
```

This supports the hypothesis that missing forwarding was real, but field behavior shows it was not the only issue.

## Operational workaround used locally

Because isolated `agentTurn` remained unreliable in production runtime, these jobs were migrated away from OpenClaw isolated cron into OS cron wrappers:

- `comapサーバー監視・自動起動`
- `allowlist doctor`
- `cron doctor`

That workaround reduced recurring `exec denied` / timeout noise, but it is not a real product fix.

## What upstream should fix

1. Ensure `payload.execPolicy` is always applied to isolated/manual cron runs, not just stored in `jobs.json`.
2. Make it observable in transcript/run metadata which effective exec policy was actually used.
3. Prevent model-side composite/creative detours in narrow cron `agentTurn` jobs, or provide a non-agent script runner mode for cron.
4. Avoid reporting runs as `status:"ok"` when the summary text clearly indicates execution could not proceed.
5. Make stale cron state less confusing when jobs are disabled or when runtime/job JSON diverge.
