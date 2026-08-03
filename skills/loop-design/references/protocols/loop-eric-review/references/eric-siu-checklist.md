# AI Loop review checklist

Use this as an operational synthesis, not as a substitute for source transcripts.

| Test | Pass condition |
|---|---|
| Gap | Target, current state, and gap are explicit and observable |
| Context | Durable state and evidence are available at decision time |
| Judgment | Scoring or reasoning policy produces a bounded next action |
| Action | Tools can act with scoped permissions and idempotency |
| Feedback | Outcomes return after a defined delay and link to the originating run |
| Learning | Evaluated results can improve a versioned policy or skill |
| Leverage | The loop attacks a frequent, valuable bottleneck with compounding data |
| Human control | Consequential actions have named approvers and timeout behavior |
| Limits | Budget, iterations, stop, escalation, rollback, and kill switch exist |
| Operations | Storage, tools, alerts, monitoring, ownership, and recovery are tested |

Reject designs that merely repeat a prompt, generate output without observing outcomes, hide several independent loops in one workflow, or claim autonomy without operational controls.
