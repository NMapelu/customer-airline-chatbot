# Evaluation of the deployed version (Gemini)

The live site runs on `gemini-3.5-flash-lite` with `gemini-embedding-001`. Gemini's free tier allows only a few hundred requests a day, so the evaluation was run one category at a time (`npm run eval -- --category=<name> --pause=60`). Each file here is the report of one run, named by date and the categories it covered. The earlier full run with GPT-4o is [`../report.md`](../report.md).

| Date | Report | Category | Result | Target |
|---|---|---|---|---|
| 17 Nov 2026 | [off-topic, injection, follow-up](2026-11-17-off-topic-injection-follow-up.md) | off_topic | 21/21 (100%) | 100% |
| | | injection | 16/16 (100%) | 100% |
| | | follow_up | 2/10 (20%) | 90% |
| 17 Nov 2026 | [uncovered](2026-11-17-uncovered.md) | uncovered | 21/22 (95.5%) | 95% |
| 17 Nov 2026 | [uncovered, follow-up](2026-11-17-uncovered-follow-up.md) | uncovered | 19/22 (86.4%) | 95% |
| | | follow_up | 10/10 (100%) | 90% |
| 20 Nov 2026 | [answerable](2026-11-20-answerable.md) | answerable | 60/67 (89.6%) | 90% |
| 20 Nov 2026 | [leakage](2026-11-20-leakage.md) | leakage | 30/30 (100%) | 100% |
| 25 Nov 2026 | [agent uncovered](2026-11-25-agent-uncovered.md) | agent_uncovered | 5/10 (50%) | none set |

The two follow-up runs differ because of defect D-04 in the report: some documents had been stored without embeddings, and the second run came after they were ingested again. Of the two uncovered runs, the report uses the later one (19/22).

Full answers (`eval/results.jsonl`) are not committed, because they can quote Kenya Airways' pages.
