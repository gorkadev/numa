# File Ownership Specification

## Purpose

Defines how write tools given to a worker are scoped to a declared set of owned files, so parallel workers cannot corrupt each other's edits and protected paths stay safe regardless of delegation.

## Requirements

### Requirement: Declared Ownership Per Task
Each task dispatched to a worker MUST declare the set of file paths it owns. The worker's write tools MUST be scoped to exactly that set for the duration of its run.

#### Scenario: Task declares two owned files
- GIVEN a task declares ownership of `levels/level1.js` and `levels/level1.json`
- WHEN the worker is dispatched with that task
- THEN its write tools accept writes only to those two paths

### Requirement: Out-of-Scope Writes Are Rejected With an Actionable Error
WHEN a worker's write tool receives a path outside its declared ownership set, the system MUST reject the write and return an actionable error identifying the offending path and the fact that it is out of scope.

#### Scenario: Worker attempts to write an unowned file
- GIVEN a worker owns only `levels/level1.js`
- WHEN it calls a write tool targeting `levels/level2.js`
- THEN the write is rejected
- AND the returned error names `levels/level2.js` and states it is outside the worker's owned scope
- AND no file is modified

#### Scenario: Worker writes within scope succeeds
- GIVEN a worker owns `levels/level1.js`
- WHEN it calls a write tool targeting `levels/level1.js`
- THEN the write succeeds

### Requirement: Engine and Vendor Protections Preserved
The existing protections against writes to the `engine/` and `vendor/` directories MUST remain in force for ownership-scoped write tools, even if a task's declared ownership set names a path inside those directories.

#### Scenario: Task attempts to declare ownership inside engine/
- GIVEN a task declares ownership of a path under `engine/`
- WHEN the worker attempts to write to that path
- THEN the write is rejected as protected, regardless of the declared ownership

#### Scenario: Task attempts to declare ownership inside vendor/
- GIVEN a task declares ownership of a path under `vendor/`
- WHEN the worker attempts to write to that path
- THEN the write is rejected as protected, regardless of the declared ownership

### Requirement: `index.html` Cannot Be Deleted
No write tool, scoped or unscoped, MAY delete `index.html`.

#### Scenario: Worker attempts to delete index.html
- GIVEN a worker's declared ownership set includes `index.html`
- WHEN it calls a delete operation targeting `index.html`
- THEN the delete is rejected
- AND `index.html` remains unchanged

### Requirement: Parallel Dispatch Requires Disjoint Ownership
The orchestrator MUST NOT run two workers concurrently whose declared ownership sets share any path. This is the ownership-side contract that `agent-orchestration`'s parallel dispatch rule relies on.

#### Scenario: Ownership sets overlap
- GIVEN two candidate tasks declare ownership sets sharing at least one file path
- WHEN the orchestrator plans dispatch
- THEN it does not run them concurrently
