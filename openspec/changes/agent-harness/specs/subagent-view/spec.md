# Sub-Agent View Specification

## Purpose

Defines the record kept for each sub-agent run and the UI surface that lets a player follow and inspect sub-agents: an inline entry in the thread (shimmering while it runs), a right-side panel opened from the thread header or from that entry, and each run's named bot, role, concrete model, tool calls, edits and token usage, including after a page reload.

## Requirements

### Requirement: Sub-Agent Run Record Fields
Each sub-agent run MUST be recorded with at least: its role, its role's display name, the tier and slot it was resolved from, the concrete model registry entry it ran on (id and display name), the tool calls it made, the files it edited, its token usage, and its final status (success, failed, incomplete, or aborted).

#### Scenario: Record created for a completed worker
- GIVEN a worker completes its run
- WHEN its run record is created
- THEN the record includes its role, display name, tier, slot, concrete model, tool calls, edited files, token usage, and final status

#### Scenario: Record created for a failed worker
- GIVEN a worker fails partway through its run
- WHEN its run record is created
- THEN the record still includes its role, display name, concrete model, the tool calls made before failure, any files edited before failure, token usage consumed, and a failed status

#### Scenario: Record outlives a registry change
- GIVEN a run record names a registry entry that was later removed from the registry
- WHEN the record is displayed
- THEN it still shows the concrete model's display name stored in the record

### Requirement: Inline Entry Shimmers While Running
While a sub-agent run is in progress, the thread MUST show an inline entry for it in the assistant message, naming its display name and current activity, rendered with the shimmer treatment used for other in-progress work. When the run finishes, the entry MUST stop shimmering and show the final status.

#### Scenario: A worker is running
- GIVEN a phased turn has dispatched a worker that has not finished
- WHEN the player looks at the thread
- THEN an inline entry with the worker's display name is shown with the shimmer treatment

#### Scenario: A worker finishes
- GIVEN a worker's inline entry was shimmering
- WHEN the worker's run ends with any status
- THEN the entry stops shimmering and shows that status

### Requirement: Sub-Agent Runs Are Openable From the Thread
The system MUST provide a thread-header button that opens a right-side panel listing every recorded sub-agent run of the thread. Activating an inline sub-agent entry, whether the run is still in progress or finished, MUST open the same panel focused on that run.

#### Scenario: Player opens the panel from the header
- GIVEN a phased turn ran one or more sub-agents
- WHEN the player activates the thread-header button
- THEN the panel opens listing the recorded runs
- AND they can select any run and see its full detail (display name, role, concrete model, tier and slot, tool calls, edits, tokens, status)

#### Scenario: Player clicks a running entry
- GIVEN a sub-agent's inline entry is shimmering
- WHEN the player activates it
- THEN the panel opens focused on that run
- AND the run's detail keeps updating while it runs

#### Scenario: Player clicks a finished entry
- GIVEN a sub-agent's inline entry shows a final status
- WHEN the player activates it
- THEN the panel opens focused on that run

### Requirement: Sub-Agents Are Presented as Named Bots
Every place that presents a sub-agent run to the player MUST use the role's display name from the role catalogue as the primary label, with the role as secondary information. The concrete model MUST appear in the run's detail in the panel, not as the primary label.

#### Scenario: Two runs of different roles
- GIVEN a turn ran the explorer and a gameplay worker
- WHEN the panel lists the runs
- THEN each is labelled with its role's display name
- AND each run's detail shows the concrete model it ran on

### Requirement: Sub-Agent Records Survive Reload
Sub-agent run records MUST be persisted such that they remain visible and inspectable after the page or thread is reloaded, not only for the duration of the live session.

#### Scenario: Reload after a phased turn
- GIVEN a phased turn with sub-agent runs has completed and the thread was persisted
- WHEN the player reloads the page and reopens the thread
- THEN the inline entries and the panel still show the same recorded runs with the same detail
