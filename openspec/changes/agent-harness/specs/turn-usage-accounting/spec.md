# Turn Usage Accounting Specification

## Purpose

Defines how token usage from the orchestrator and every dispatched sub-agent is priced and summed so that credits charged, persisted turn metadata, the ledger, and Polar billing all reflect the true cost of a turn, exactly once per turn.

## Requirements

### Requirement: Per-Model Pricing
The system MUST price each model's token usage at that model's own rate, where "model" means the concrete model registry entry that ran (see `model-tiers`), not the tier or slot it was resolved from. It MUST NOT apply one entry's rate to another entry's usage.

#### Scenario: Turn uses two different models
- GIVEN the orchestrator runs on registry entry A and a dispatched sub-agent runs on registry entry B
- WHEN turn cost is computed
- THEN entry A's usage is priced at entry A's rate card
- AND entry B's usage is priced at entry B's rate card

#### Scenario: Same provider model at two efforts
- GIVEN two registry entries share a provider model id but differ in reasoning effort
- WHEN usage from each is priced
- THEN each is priced at its own entry's rate card

### Requirement: Full-Turn Summation
The system MUST sum the priced usage of the orchestrator and every dispatched sub-agent (including sub-agents that failed or were aborted) into one total turn cost before emitting the credits chunk.

#### Scenario: Turn with one worker
- GIVEN the orchestrator's own usage and one worker's usage, each already priced at its own model's rate
- WHEN the turn total is computed
- THEN the total equals the sum of both priced amounts

#### Scenario: Turn with no sub-agents
- GIVEN a tweak turn where the orchestrator does all the work itself
- WHEN the turn total is computed
- THEN the total equals the orchestrator's own priced usage

### Requirement: Failed or Aborted Sub-Agent Usage Still Counts
Tokens already consumed by a sub-agent that failed, was incomplete, or was aborted MUST still be included in the turn total. A sub-agent's non-success status MUST NOT cause its usage to be dropped from billing.

#### Scenario: A worker fails partway through
- GIVEN a worker consumes tokens and then fails with an internal error
- WHEN the turn total is computed
- THEN the worker's already-consumed usage is included in the total

#### Scenario: A worker is aborted by the shared ceiling
- GIVEN a worker is aborted when the turn's time ceiling is reached
- WHEN the turn total is computed
- THEN the worker's usage up to the abort point is included in the total

### Requirement: Credits Chunk Reflects the Full Turn
The `data-turn-credits` chunk MUST be computed from the full-turn total (orchestrator plus every sub-agent), not from the orchestrator's usage alone.

#### Scenario: Phased turn with multiple workers
- GIVEN a phased turn dispatched three workers with priced usage each
- WHEN the credits chunk is emitted
- THEN its cost reflects the orchestrator's usage plus all three workers' usage

### Requirement: Persisted Turn Metadata Reflects the Full Turn
The turn metadata persisted with the thread MUST record the full-turn total usage, not only the orchestrator's own usage.

#### Scenario: Thread persistence after a phased turn
- GIVEN a phased turn completed with sub-agent usage
- WHEN the turn's metadata is persisted with the thread
- THEN the persisted usage total matches the full-turn total, including all sub-agents

### Requirement: Ledger and Polar Reflect the Full Turn
The append-only usage ledger entry and the ingested Polar usage event MUST both report the full-turn total, not the orchestrator's usage alone.

#### Scenario: Ledger entry for a phased turn
- GIVEN a phased turn with sub-agent usage
- WHEN the ledger records the turn
- THEN the recorded amount matches the full-turn total

### Requirement: Exactly One Polar Event Per Turn
The system MUST ingest exactly one Polar usage event per turn, using the same `externalId` scheme already in use, regardless of how many sub-agents ran during that turn.

#### Scenario: Turn dispatches multiple sub-agents
- GIVEN a phased turn dispatches several sub-agents
- WHEN the turn completes
- THEN exactly one Polar event is ingested for that turn
- AND its `externalId` follows the existing per-turn scheme unchanged

#### Scenario: Turn with a failed sub-agent still ingests once
- GIVEN a turn where one sub-agent failed but the turn still completes
- WHEN the turn completes
- THEN exactly one Polar event is ingested, reflecting the full-turn total including the failed sub-agent's spent usage

### Requirement: Per-Sub-Agent Usage Breakdown Retained
The system MUST retain a per-sub-agent usage breakdown (at least: role, concrete model registry entry id, and priced cost) in addition to the full-turn total, and MUST record the turn's tier with it, so it can be displayed later (e.g. in the sub-agent view) and re-derived after tier profiles change.

#### Scenario: Breakdown available after a phased turn
- GIVEN a phased turn ran an understand phase and two workers
- WHEN the turn's usage data is inspected
- THEN a breakdown listing each of the three sub-agent runs, their role, concrete model entry id, and priced cost is available
- AND the turn's tier and the full-turn total are also available
