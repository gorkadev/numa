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
  body: `**controls.js** — camera rigs, all \`{ dispose }\`:
\`createOrbitCamera(engine, { target, minDistance, maxDistance, autoRotate })\`,
\`createFollowCamera(engine, target, { offset, lookOffset, followRotation })\`
(third person; call \`.snap()\` after a respawn),
\`createTopDownCamera(engine, target, { height, back })\`,
\`createSideCamera(engine, target, { distance, height, deadzone })\`,
\`createFirstPersonControls(engine, input, { speed, eyeHeight })\`,
\`createFlyCamera(engine, input)\`.
\`createPlayerMotor(engine, input, object, { speed, body, planar })\` turns
input into camera-relative movement and turns the model to face it.

**physics.js** — \`createPhysics(engine, { gravity })\`:
\`addBody(object, { size, gravityScale, restitution, drag, onGround, onCollide })\`,
\`addStatic(mesh)\`, \`refreshStatic(collider)\`, \`jump(body, height)\`,
\`groundAt(x, z)\`, \`remove(body)\`. Bodies are boxes standing on their feet,
which is where every model here has its origin. Drive one by writing
\`body.velocity\`. Also \`overlaps(a, b, radius)\`, \`overlapsFlat\`,
\`collect(items, target, radius, fn)\`, \`clampToBounds\`.`,
}
