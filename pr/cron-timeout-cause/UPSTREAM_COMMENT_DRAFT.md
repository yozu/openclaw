I dug further into the recurring cron `exec denied` / timeout reports in a real production workspace, and the field evidence suggests this is not a single bug.

Confirmed facts from a live installation:

1. `jobs.json` can store `payload.execPolicy: { security: "full", ask: "off" }` for isolated cron jobs, while actual isolated/manual behavior still sometimes reflects `security=allowlist ask=on-miss`.
   - Observed on jobs such as:
     - `e5e1a907-8067-4554-b17c-2f159c050f6a` (`allowlist doctor`)
     - `7714108a-3465-4e8d-b967-a57e6a07bc4d` (`cron doctor`)
     - `50ab3fdc-973b-4923-8251-aa7791530a4e` (`comapサーバー監視・自動起動`)
   - Example finished summaries for `50ab...` explicitly said:
     - `exec denied: Cron runs cannot wait for interactive exec approval.`
     - `Effective host exec policy: security=allowlist ask=on-miss askFallback=allowlist`
   - This was observed after both `~/.openclaw/exec-approvals.json` and job JSON had already been aligned to full/off.

2. There is a separate "model turn waste / timeout" class.
   - `allowlist doctor` is a lightweight script and can succeed in about 31s when the model follows the intended single-command path (`runAtMs: 1776069437098`, `durationMs: 31234`).
   - But other runs of the same job timed out (`runAtMs: 1776074534844`, `durationMs: 90260`, `error: cron: job execution timed out`) or finished `status:"ok"` while still effectively reporting exec denial because the model constructed a composite exec path.
   - So even if execPolicy forwarding is fixed, there is still a separate problem where isolated cron `agentTurn` spends time/behavior budget on detours instead of executing the narrow intended action.

3. Heavy browser jobs are another distinct timeout class.
   - Example: `b7b0adf1-83f2-47da-b311-2ef8289d1307` (`RTX 3090 / 3090 Ti / 4090 価格チェック`) timed out twice near 900s, but after simplifying the job it completed successfully in `183634ms`.
   - So not every timeout in cron should be interpreted as execPolicy failure.

Local code investigation:

- I added an isolated/manual forwarding patch so cron payload exec policy reaches the embedded isolated agent executor.
- Relevant files in the local patch:
  - `src/cron/isolated-agent/run-executor.ts`
  - `src/cron/types.ts`
  - `src/cron/isolated-agent/run.exec-policy-forwarding.test.ts`
- Build output confirmed the forwarding path included:
  - `execOverrides: params.agentPayload?.execPolicy`

That supports the idea that missing forwarding was real, but field behavior shows it was not the only root cause.

What seems worth fixing upstream:

1. Make sure `payload.execPolicy` is always applied to isolated/manual cron runs, not only persisted in `jobs.json`.
2. Expose the actually-effective exec policy in run metadata/transcripts in an easy-to-inspect way.
3. Avoid marking a run `status:"ok"` when the summary text clearly indicates execution could not proceed.
4. Consider a non-agent/script-runner mode for narrow cron jobs so lightweight doctor/watchdog jobs are not forced through a full agentTurn path.
5. Reduce stale-state confusion when jobs are disabled or when runtime state diverges from stored JSON.

As an operational workaround, I had to migrate some recurring doctor/watchdog jobs out of isolated OpenClaw cron and into OS cron wrappers because the production runtime remained unreliable even after prompt and job-definition tightening.
