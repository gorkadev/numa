# Game Verification Specification

## Purpose

Defines the headless-browser verification step that must run the built game, capture evidence, distinguish turn-caused errors from pre-existing ones, and never let the reply claim success without having actually run.

## Requirements

### Requirement: Verify Runs the Game in Headless Chromium
The verify role MUST launch the built game inside a headless Chromium instance and MUST capture browser console errors and a screenshot of the running game.

#### Scenario: Verify runs after workers finish
- GIVEN all dispatched workers for a phased turn have completed
- WHEN the verify phase runs
- THEN it loads the game in headless Chromium
- AND it records any console errors emitted during load and initial play
- AND it captures a screenshot of the rendered game

### Requirement: Distinguish Turn-Caused Errors From Pre-Existing Ones
The verify role MUST determine whether a captured console error was introduced by the current turn's changes or was already present before the turn started. It MUST report these as distinct categories.

#### Scenario: New error introduced by this turn
- GIVEN a console error appears that was not present before the turn's changes
- WHEN verify reports its findings
- THEN the error is categorized as caused by this turn

#### Scenario: Pre-existing error unrelated to this turn
- GIVEN a console error was already present before the turn's changes were applied
- WHEN verify reports its findings
- THEN the error is categorized as pre-existing, not caused by this turn

### Requirement: One Corrective Retry on Turn-Caused Failure
WHEN verify finds at least one turn-caused console error, the system MUST attempt exactly one corrective pass (dispatching a worker to fix the identified issue) before finalizing the reply. It MUST NOT retry more than once.

#### Scenario: Turn-caused error triggers one retry
- GIVEN verify finds a turn-caused console error
- WHEN the orchestrator processes the verify result
- THEN it dispatches one corrective worker pass targeting the reported error
- AND after that corrective pass, verify does not run a second corrective retry regardless of outcome

### Requirement: Honest Reporting After Retry
After the single corrective retry, the system MUST report the actual outcome to the player — whether the game now verifies cleanly, still has turn-caused errors, or verification could not complete — rather than asserting success unconditionally.

#### Scenario: Error persists after the one retry
- GIVEN the corrective retry did not eliminate the turn-caused error
- WHEN the orchestrator composes the reply
- THEN the reply states that the issue remains rather than claiming the game works

#### Scenario: Retry fixes the error
- GIVEN the corrective retry eliminates the turn-caused error and a subsequent verify pass finds none
- WHEN the orchestrator composes the reply
- THEN the reply may state the game verifies successfully

### Requirement: Never Claim Success Without Running Verify
The system MUST NOT state or imply in its reply that the game works or has been verified unless the verify phase actually executed for that turn.

#### Scenario: Verify was skipped
- GIVEN a turn's verify phase did not run (e.g. an earlier phase aborted)
- WHEN the orchestrator composes the reply
- THEN the reply does not claim the game was verified or confirmed working

### Requirement: Behavior When the Verifier Is Unavailable
WHEN the headless Chromium verification environment is unavailable or fails to start, the system MUST report this condition honestly and MUST NOT treat the unavailability as a passing verification.

#### Scenario: Chromium sandbox fails to provision
- GIVEN the verify phase cannot provision its Chromium-enabled sandbox
- WHEN the orchestrator composes the reply
- THEN it states that verification could not run
- AND it does not claim the game was confirmed working
