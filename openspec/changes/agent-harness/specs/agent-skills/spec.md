# Agent Skills Specification

## Purpose

Defines the skills registry that replaces always-loaded engine instructions: registry entries, deterministic per-role defaults, orchestrator-selected extras, a capped `loadSkill` fallback, and the exclusion of any shell execution capability.

## Requirements

### Requirement: Registry Entry Shape
Each entry in the skills registry MUST declare a name, a description, and a trigger (the condition or context under which the skill is relevant).

#### Scenario: Registry entry has all three fields
- GIVEN a skill is added to the registry
- WHEN it is inspected
- THEN it has a non-empty name, a non-empty description, and a trigger

### Requirement: Deterministic Role Defaults
Each role MUST have a fixed, deterministic set of default skills that are always included in that role's instructions when it is dispatched. This selection MUST NOT depend on model choice at runtime.

#### Scenario: Same role always gets the same defaults
- GIVEN the gameplay role's default skill set is defined as a fixed list
- WHEN the gameplay role is dispatched on two different turns
- THEN both dispatches include the same default skills in their instructions

### Requirement: Orchestrator-Selected Extra Skills
The orchestrator MAY add extra skills from the registry beyond a role's defaults when dispatching a worker, based on the task at hand.

#### Scenario: Orchestrator adds an extra skill
- GIVEN a task requires a skill not in the worker role's default set
- WHEN the orchestrator dispatches that worker
- THEN the extra skill's content is included in the worker's instructions in addition to the role's defaults

### Requirement: `loadSkill` Fallback With Capped, Truncated Output
The system MUST provide a `loadSkill` tool that a worker can call to pull a skill not already pushed into its instructions. WHEN the requested skill's content exceeds the configured size cap, the system MUST truncate it and MUST include a truncation marker in the returned content.

#### Scenario: Worker pulls a skill within the cap
- GIVEN a worker calls `loadSkill` for a skill whose content is under the size cap
- WHEN the tool returns
- THEN the full skill content is returned with no truncation marker

#### Scenario: Worker pulls a skill exceeding the cap
- GIVEN a worker calls `loadSkill` for a skill whose content exceeds the size cap
- WHEN the tool returns
- THEN the content is truncated to the cap
- AND the returned content includes a truncation marker indicating more content was omitted

### Requirement: Unknown Skill Name Returns an Error
WHEN `loadSkill` is called with a name not present in the registry, the tool MUST return an error rather than an empty or fabricated result.

#### Scenario: Worker requests a nonexistent skill
- GIVEN a worker calls `loadSkill` with a name that does not exist in the registry
- WHEN the tool executes
- THEN it returns an error identifying the skill name as unknown
- AND no skill content is returned

### Requirement: No Shell Execution Exposed
The skills system MUST NOT expose any tool capable of executing arbitrary shell commands to a worker or the orchestrator. Skills are instructions, not executable scripts; any executable step belongs in the Daytona sandbox tools already scoped to file ownership.

#### Scenario: Worker instructions include pushed skills
- GIVEN a worker's instructions include its default skills and any orchestrator-added extras
- WHEN its tool set is assembled
- THEN no `bash` or equivalent shell-execution tool is present

#### Scenario: `loadSkill` tool itself
- GIVEN the `loadSkill` tool is available to a worker
- WHEN its capability is inspected
- THEN it only returns skill text content and never executes commands
