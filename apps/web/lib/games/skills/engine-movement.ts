import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s `controls.js` and `physics.js` entries (source lines 101-118).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineMovementSkill: Skill = {
  name: "engine-movement",
  description:
    "Camera rigs (`controls.js`) and the physics/collision helpers (`physics.js`).",
  trigger:
    "A task drives a player or camera through space: following, orbiting, first-person controls, gravity, collisions, or ground checks.",
  body: `**controls.js** — camera rigs; returns vary by rig, not just \`{ dispose }\`:
\`createOrbitCamera(engine, { target, minDistance, maxDistance, maxPolarAngle, enablePan, autoRotate })\`
→ \`{ controls, dispose() }\` — for inspecting a scene, not inhabiting it.
\`createFollowCamera(engine, target, { offset, lookOffset, positionHalfLife, lookHalfLife, followRotation })\`
→ \`{ snap(), setOffset(x, y, z), dispose() }\` — third-person chase.
\`positionHalfLife\`/\`lookHalfLife\` (seconds for half the remaining distance
to close, default 0.12/0.06) are THE feel knobs: lower is snappier, higher is
looser. Call \`.snap()\` after a respawn, or the camera visibly lerps in from
its old spot.
\`createTopDownCamera(engine, target, { height, back, halfLife })\` and
\`createSideCamera(engine, target, { distance, height, deadzone, halfLife })\`
→ \`{ dispose() }\`.
\`createFirstPersonControls(engine, input, { speed, sprintMultiplier, eyeHeight, prompt })\`
→ \`{ controls, locked, lock(), dispose() }\` — shows a click-to-play prompt
(pointer lock needs a user gesture) and releases on Escape.
\`createFlyCamera(engine, input, { speed, lookSpeed })\` → \`{ dispose() }\` —
debug-only free fly, WASD + mouse drag, Q/E for up/down.

\`createPlayerMotor(engine, input, object, { speed, sprintMultiplier, turnHalfLife, body, planar })\`
turns input into camera-relative movement and turns the model to face it
(\`turnHalfLife\` damps the turn). Returns a live \`motor\`, not just a
disposer: \`motor.moving\` (bool), \`motor.speed\` (current scale, 0 when
stopped), \`motor.direction\` (Vector3), \`motor.dispose()\`. Feed
\`motor.moving\`/\`motor.speed\` into \`walkCycle(rig, elapsed, speed)\`
(\`engine-feedback\`) each frame so the stride follows actual movement instead
of a guessed animation state.

**physics.js** — \`createPhysics(engine, { gravity, maxFallSpeed })\`:
\`addBody(object, { size, gravityScale, restitution, drag, onGround, onCollide })\`,
\`addStatic(mesh)\`, \`refreshStatic(collider)\`, \`jump(body, height)\`,
\`groundAt(x, z)\`, \`remove(body)\`. Bodies are boxes standing on their feet,
which is where every model here has its origin. Drive one by writing
\`body.velocity\`. Also \`overlaps(a, b, radius)\`, \`overlapsFlat\`,
\`collect(items, target, radius, fn)\`, \`clampToBounds\`.`,
}
