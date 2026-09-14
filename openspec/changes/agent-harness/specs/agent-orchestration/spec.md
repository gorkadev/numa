# Agent Orchestration Specification

## Purpose

Defines how the orchestrator routes a turn by size, runs phased in-process sub-agents with fixed roles, and stays the sole owner of player-facing questions and `ask_player`.

## Requirements

### Requirement: Size Routing
The orchestrator MUST classify each turn as either a **tweak** (small, localized change) or **phased** (new game or large feature) before doing any work.

#### Scenario: Small tweak routed directly
- GIVEN a player message describing a small, localized change to an existing game
- WHEN the orchestrator classifies the turn
- THEN it edits the files itself using its own tools
- AND it does not dispatch any sub-agent

#### Scenario: New game or big feature routed to phases
- GIVEN a player message that requests a new game or a feature spanning multiple files or systems
- WHEN the orchestrator classifies the turn
- THEN it runs the phased flow: understand, design, tasks, workers, verify, reply

### Requirement: Fixed Phase Order
For a phased turn, the system MUST execute phases in the order: understand, design, tasks, workers, verify, reply. A later phase MUST NOT start before its predecessor completes or aborts.

#### Scenario: Phases run in order
- WHEN a phased turn runs
- THEN understand completes (or is skipped by orchestrator judgment) before design starts
- AND design completes before tasks are produced
- AND tasks are produced before any worker is dispatched
- AND all dispatched workers finish before verify runs
- AND verify finishes before the reply is composed

#### Scenario: An earlier phase aborts
- GIVEN a phase fails or is aborted
- WHEN the orchestrator detects the failure
- THEN it does not start the next phase
- AND it proceeds to compose a reply describing what happened

### Requirement: Fixed Roles Per Phase
Each phase MUST run under a role with a fixed tool set, model slot (`strong`, `mid` or `light`), and step budget, all declared in the role catalogue before dispatch. A role MUST reference a slot, never a model id or provider; its concrete model is resolved from the turn's tier as defined by `model-tiers`. A worker MUST NOT change its own tools, model, or step budget at runtime.

#### Scenario: Role dispatch carries fixed parameters
- WHEN the orchestrator dispatches a sub-agent for a given role
- THEN the sub-agent receives a specific tool set scoped to that role
- AND the concrete model of its role's slot in the turn's tier
- AND a specific maximum step count
- AND the sub-agent cannot request a different tool, model, or step budget during its run

#### Scenario: Role catalogue names no model
- GIVEN the role catalogue
- WHEN any role definition is inspected
- THEN it declares a slot
- AND it names no model id, provider model id or provider

### Requirement: Orchestrator Runs the Tier's Strong Slot
The orchestrator MUST run on the `strong` slot of the tier the player selected for the turn. The player's choice selects a tier; it MUST NOT select the orchestrator's model directly.

#### Scenario: Orchestrator model follows the tier
- GIVEN the player selected tier `fast`
- WHEN the orchestrator's turn starts
- THEN it runs on the `fast` profile's `strong` entry

### Requirement: Named Bot Identity Per Role
Each sub-agent role MUST have a stable display name in the role catalogue, used wherever the role is presented to the player. The display name MUST NOT be derived from the model the role runs on.

#### Scenario: Display name is stable across tiers
- GIVEN the explorer role has a display name
- WHEN it runs on a `pro` turn and on a `fast` turn
- THEN both runs are presented under the same display name

### Requirement: Workers Never Delegate
A worker sub-agent MUST NOT dispatch another sub-agent. Only the orchestrator may create sub-agent dispatches.

#### Scenario: Worker attempts to delegate
- GIVEN a worker sub-agent is running
- WHEN its tool set is assembled
- THEN no dispatch or sub-agent-creation tool is included
- AND the worker cannot cause another sub-agent to run

### Requirement: `ask_player` Stays With the Orchestrator
Only the orchestrator MAY call `ask_player`. Worker sub-agents MUST NOT have `ask_player` in their tool set.

#### Scenario: Worker tool set excludes ask_player
- GIVEN any worker role (understand, design, gameplay, visuals, audio, verify)
- WHEN its tools are assembled
- THEN `ask_player` is absent from that tool set

#### Scenario: Orchestrator asks a clarifying question
- GIVEN the orchestrator determines it needs player input
- WHEN it calls `ask_player`
- THEN the call is made directly by the orchestrator, not by a delegated sub-agent

### Requirement: Sub-Agent Failures Return as a Result
A sub-agent failure (error, exception, or internal abort) MUST be captured and returned to the orchestrator as a structured result. It MUST NOT crash or terminate the orchestrator's turn.

#### Scenario: A worker throws an internal error
- GIVEN a dispatched worker encounters an unrecoverable internal error
- WHEN the error occurs
- THEN the dispatch tool returns a result marked as failed, including a short reason
- AND the orchestrator's turn continues executing

#### Scenario: A worker exhausts its step budget
- GIVEN a dispatched worker reaches its maximum step count without finishing
- WHEN the step budget is exhausted
- THEN the dispatch tool returns a result marked as incomplete
- AND the orchestrator's turn continues executing

### Requirement: Abort Propagation
WHEN the orchestrator's turn is aborted (timeout, cancellation, or ceiling reached), every in-flight sub-agent dispatch MUST also stop and report an aborted status rather than continue running independently.

#### Scenario: Turn hits the shared time ceiling
- GIVEN one or more sub-agents are running when the turn's shared time ceiling is reached
- WHEN the abort signal fires
- THEN each in-flight sub-agent stops
- AND each reports an aborted status to the orchestrator
- AND no sub-agent keeps running after the turn has ended

### Requirement: Compact Result Envelope
Each sub-agent dispatch MUST return a compact result to the orchestrator: status (success, failed, incomplete, aborted), a summary usable in the reply, and enough detail for the orchestrator to decide the next phase — without forwarding the sub-agent's full internal transcript.

#### Scenario: Successful worker returns a compact result
- GIVEN a worker completes its assigned task successfully
- WHEN it returns to the orchestrator
- THEN the result includes a success status and a short summary of what changed
- AND the orchestrator's context is not expanded with the worker's full step-by-step transcript

### Requirement: Parallel Dispatch Only on Disjoint Ownership
The orchestrator MUST dispatch two or more workers concurrently only when their declared file ownership sets are disjoint. If any two workers' ownership sets overlap, they MUST run sequentially.

#### Scenario: Two tasks own different files
- GIVEN two tasks declare non-overlapping sets of owned files
- WHEN the orchestrator dispatches both
- THEN both workers run concurrently

#### Scenario: Two tasks own an overlapping file
- GIVEN two tasks declare ownership sets that share at least one file
- WHEN the orchestrator plans dispatch
- THEN it runs those two tasks sequentially, never concurrently

### Requirement: Question Behavior Based on Message Specificity
The orchestrator MUST decide whether to ask a clarifying question based on how specific the player's first message is, and MUST cap clarifying questions for an undecided request.

#### Scenario: First message names a kind of game
- GIVEN a player's first message names a specific kind of game (e.g. "a platformer with a jumping frog")
- WHEN the orchestrator processes the message
- THEN it proceeds to build without asking a clarifying question

#### Scenario: First message is undecided
- GIVEN a player's first message does not name any specific kind of game (e.g. "make me a game")
- WHEN the orchestrator processes the message
- THEN it asks at most two clarifying questions before proceeding to build

#### Scenario: Player asks a question mid-turn
- GIVEN the player sends a question rather than a build instruction
- WHEN the orchestrator processes it
- THEN it answers in text
- AND it does not necessarily dispatch any sub-agent to answer a plain question
