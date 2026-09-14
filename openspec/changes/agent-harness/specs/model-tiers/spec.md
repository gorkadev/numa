# Model Tiers Specification

## Purpose

Defines how the player chooses a power/budget **tier** rather than a model, how each agent role reaches a concrete model only through a **slot** of that tier, and how a numa-owned **model registry** keeps providers, model names, reasoning effort and rates out of roles, prompts and billing logic.

## Requirements

### Requirement: Player Selects a Tier, Not a Model
The player MUST choose a tier from a closed set of tier ids (initially `pro`, `balanced`, `fast`). The system MUST NOT let the player choose a concrete model or provider directly. Tier ids MUST be stable; the labels shown for them are presentation and MAY change without changing the ids.

#### Scenario: Player picks a tier
- GIVEN the composer shows the model picker
- WHEN the player selects the `pro` tier
- THEN the next turn is sent with tier `pro`
- AND no concrete model id is sent from the browser

#### Scenario: Unknown tier from the browser
- GIVEN a turn arrives whose client data names a tier id that is not in the closed set
- WHEN the agent validates the client data
- THEN the turn is rejected by the schema rather than resolved to a model

#### Scenario: No tier sent
- GIVEN a turn arrives with no tier in its client data (an older tab, or a client that sends nothing)
- WHEN the agent resolves the turn's tier
- THEN it uses the default tier

### Requirement: Tier Profiles Map Three Slots
Each tier MUST have exactly one profile that maps each of the three slots — `strong`, `mid`, `light` — to an ordered, non-empty list of model registry entries: the first is the primary, the rest are fallbacks. A fallback MUST be a peer of the same tier and slot (similar capability and price class), never an entry intended for a lower slot. A tier profile MUST NOT reference a provider or a provider model id directly; it references registry entry ids only.

#### Scenario: Every slot of every tier resolves
- GIVEN the set of tiers and the set of slots
- WHEN the tier profiles are type-checked
- THEN every (tier, slot) pair names a non-empty list of existing registry entries

### Requirement: Slot Fallback on Availability Failure
When a call to a slot's current candidate fails before any output part is emitted, with an availability error (a retryable provider error, model not found, rate limit, server error, or network/connect timeout), and after the SDK's own retries for that candidate are exhausted, the system MUST retry the same call on the next candidate of the same tier and slot. The system MUST NOT fall back on content or validation errors, on an abort, or after any output part has been emitted. A candidate that failed with an availability error MUST be skipped for the rest of the turn. Usage MUST be attributed to the entry that served the call, and the usage breakdown MUST record which primary it replaced.

#### Scenario: Primary unavailable, peer serves
- GIVEN a slot whose primary returns a model-not-found error before any output
- WHEN a role on that slot makes a call
- THEN the next candidate serves the call
- AND the usage breakdown names the serving entry, priced at its own rate, with the primary recorded as the entry it replaced
- AND later calls in the same turn go straight to the serving candidate

#### Scenario: Failure after output started
- GIVEN a call whose stream has already emitted a text or tool-call part
- WHEN the provider connection fails
- THEN no fallback is attempted and the error surfaces as it does today

#### Scenario: Content error is not an availability error
- GIVEN a call rejected by the provider as an invalid request or a safety block
- WHEN the error is classified
- THEN no fallback is attempted

#### Scenario: Every candidate fails
- GIVEN a slot whose every candidate fails with availability errors
- WHEN a sub-agent on that slot runs
- THEN its run ends with an error status returned to the orchestrator, never a crash of the turn

### Requirement: Roles Resolve Models Only Through Slots
Every agent role, the orchestrator included, MUST declare a slot and MUST NOT declare a model id, provider or provider model id. The concrete model a role runs on MUST be `resolveModel(turnTier, role.slot)`.

#### Scenario: Same role on two tiers
- GIVEN the planner role is bound to the `strong` slot
- WHEN the planner is dispatched on a `pro` turn and later on a `fast` turn
- THEN the first run uses the `pro` profile's `strong` entry
- AND the second run uses the `fast` profile's `strong` entry
- AND the planner's instructions, tools and step budget are identical in both runs

#### Scenario: Orchestrator runs the tier's strong slot
- GIVEN a turn with tier `balanced`
- WHEN the orchestrator's model is resolved
- THEN it is the `balanced` profile's `strong` entry

### Requirement: Model Registry Owns Every Concrete Model
The system MUST keep a model registry in which each entry has a stable internal id, a provider, a provider model id, optional provider options (including reasoning effort), a display name, and a rate card. Provider SDK instances MUST be constructed only from registry entries, on the server.

#### Scenario: Registry entry shape
- GIVEN a registry entry is added
- WHEN it is inspected
- THEN it has a stable id, a provider, a provider model id, a display name and a rate card
- AND any provider options it declares travel with it to every call made on that entry

### Requirement: Swapping a Slot's Model Touches Only the Registry and Tier Profiles
Replacing the model behind any slot of any tier — including a change of provider — MUST require edits only to the model registry (entries and their rate cards) and the tier profiles. It MUST NOT require changes to role definitions, prompts, dispatch code, pricing formulas, the ledger or the UI.

#### Scenario: Swap the strong model of one tier
- GIVEN the `pro` tier's `strong` slot points at entry A
- WHEN a developer adds entry B to the registry with its rate card and points `pro.strong` at B
- THEN the orchestrator, planner and verifier on `pro` turns run on B
- AND no role, prompt, pricing function or UI component was edited

#### Scenario: A provider not yet installed
- GIVEN a registry entry names a provider whose SDK package is not installed
- WHEN the project is type-checked
- THEN it fails, because each provider in the registry needs a server-side factory

### Requirement: Reasoning Effort Is a Registry Property
Reasoning effort, and any other per-call provider option, MUST be a property of a registry entry. The same underlying provider model with a different effort MUST be a different registry entry with its own id and its own rate card.

#### Scenario: Same model at two efforts
- GIVEN entries `X` and `X@low` share a provider model id and differ only in reasoning effort
- WHEN a slot points at `X@low`
- THEN every call on that slot sends the low-effort provider options
- AND its usage is priced and recorded under `X@low`, not `X`

### Requirement: Usage Priced by the Concrete Entry That Ran
Token usage MUST be priced at the rate card of the registry entry that actually produced it, and every usage record MUST name that entry id. Pricing MUST NOT be keyed by tier or slot.

#### Scenario: Two slots on one turn
- GIVEN a `pro` turn whose orchestrator ran on the `strong` entry and whose explorer ran on the `light` entry
- WHEN the turn cost is computed
- THEN the orchestrator's usage is priced at the `strong` entry's rate card
- AND the explorer's usage is priced at the `light` entry's rate card
- AND the usage breakdown names both concrete entry ids

#### Scenario: Profile edited after a turn
- GIVEN a turn was recorded with entry A on the `strong` slot
- WHEN the tier profile later points `strong` at entry B
- THEN the stored record still names entry A and its cost is unchanged

### Requirement: Per-Thread Tier Persistence With Legacy Mapping
The tier each turn ran with MUST be recorded on the thread so a reload restores it. A thread whose messages recorded a legacy Gemini model id instead of a tier MUST resolve to a tier by a fixed, deterministic mapping: `gemini-3.1-pro-preview` → `pro`, `gemini-3.8-flash` → `balanced`, `gemini-3.5-flash-lite` → `fast`. Any other or unparseable value MUST read as no choice and fall back to the default tier.

#### Scenario: Reload of a tier thread
- GIVEN a thread whose last turn ran with tier `fast`
- WHEN the player reloads it
- THEN the picker shows `fast`

#### Scenario: Reload of a legacy thread
- GIVEN a dev thread whose last recorded choice is the legacy id `gemini-3.1-pro-preview`
- WHEN the player reloads it
- THEN the picker shows `pro`
- AND the next turn is sent with tier `pro`

#### Scenario: Newest record wins
- GIVEN a thread with an older legacy model record and a newer tier record
- WHEN the thread's tier is read
- THEN the newer tier record is used

### Requirement: Picker Shows Tiers
The model picker MUST list tiers, each with a label and a one-line description of its power and cost trade-off. It MUST NOT show provider names or model names.

#### Scenario: Opening the picker
- WHEN the player opens the model picker
- THEN it lists exactly the tiers in the closed set, with the current tier checked
- AND no row names a provider or a concrete model

### Requirement: Initial Registry Population
The registry in this change MUST contain only the three existing Gemini models on the installed Vertex provider, arranged into the three tier profiles. Adding any other provider or model is out of scope for this change.

#### Scenario: Registry contents at ship
- WHEN the registry is inspected after this change ships
- THEN it contains exactly the entries `gemini-3.1-pro-preview`, `gemini-3.8-flash` and `gemini-3.5-flash-lite`, all on the Vertex provider
