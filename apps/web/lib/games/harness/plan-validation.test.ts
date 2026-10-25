import assert from "node:assert/strict"
import { test } from "node:test"

import { parseStoredPlanArtifact, receiptAction, validateDispatch } from "./plan-validation"
import type { TaskSpec } from "./task-spec"

function task(id: string, owns: string[], dependsOn: string[] = []): TaskSpec {
  return { id, role: "gameplay", title: id, goal: "Build it.", owns, dependsOn, skills: [] }
}

const noTemplate = { modelIds: [], sharedAssetIds: [], requiresAssetReceipt: false }
const toon = { modelIds: ["soldier", "enemy", "crate"], sharedAssetIds: ["tex"], requiresAssetReceipt: true }
const none = new Set<string>()

test("a plain batch of independent tasks is accepted", () => {
  assert.equal(validateDispatch([task("t1", ["game.js"]), task("t2", ["sound.js"])], { finishedIds: none, assets: noTemplate }), undefined)
})

test("a dependency cycle is named before anything starts", () => {
  const error = validateDispatch([task("a", ["a.js"], ["b"]), task("b", ["b.js"], ["a"])], { finishedIds: none, assets: noTemplate })
  assert.match(error ?? "", /cycle: a -> b -> a|cycle: b -> a -> b/)
})

test("a dependency on a task finished earlier this turn is allowed, an unknown one is not", () => {
  const batch = [task("t2", ["hud.js"], ["t1"])]
  assert.equal(validateDispatch(batch, { finishedIds: new Set(["t1"]), assets: noTemplate }), undefined)
  assert.match(validateDispatch(batch, { finishedIds: none, assets: noTemplate }) ?? "", /"t2" depends on "t1"/)
})

test("no task may own the engine, vendor or harness directories", () => {
  assert.match(validateDispatch([task("t1", ["engine/hud.js"])], { finishedIds: none, assets: noTemplate }) ?? "", /protected prefix/)
})

test("overlapping ownership needs a dependsOn between the tasks", () => {
  const overlapping = [task("t1", ["game.js"]), task("t2", ["game.js"])]
  assert.match(validateDispatch(overlapping, { finishedIds: none, assets: noTemplate }) ?? "", /overlapping ownership/)
  assert.equal(validateDispatch([task("t1", ["game.js"]), task("t2", ["game.js"], ["t1"])], { finishedIds: none, assets: noTemplate }), undefined)
})

test("a fresh template build must name its eager assets", () => {
  assert.match(validateDispatch([task("t1", ["game.js"])], { finishedIds: none, assets: toon }) ?? "", /assetReceipt/)
})

test("a fresh template build with a receipt from the catalog is accepted", () => {
  const receipt = { eagerModelIds: ["soldier", "crate"], eagerSharedAssetIds: [] }
  assert.equal(validateDispatch([task("t1", ["game.js"])], { finishedIds: none, assets: toon, receipt }), undefined)
})

test("a receipt naming a model outside the catalog is rejected", () => {
  const receipt = { eagerModelIds: ["tank"], eagerSharedAssetIds: [] }
  assert.match(validateDispatch([task("t1", ["game.js"])], { finishedIds: none, assets: toon, receipt }) ?? "", /unknown model id "tank"/)
})

test("a receipt already stored this build satisfies the requirement for a later dispatch", () => {
  assert.equal(validateDispatch([task("t2", ["hud.js"])], { finishedIds: none, assets: toon, hasStoredReceipt: true }), undefined)
})

test("a stored plan written by run_tasks carries its receipt without an assessment", () => {
  const stored = parseStoredPlanArtifact(JSON.stringify({ assetReceipt: { eagerModelIds: ["soldier"], eagerSharedAssetIds: [] }, readinessPolicyVersion: 1 }))
  assert.deepEqual(stored?.assetReceipt, { eagerModelIds: ["soldier"], eagerSharedAssetIds: [] })
})

test("a stored plan written by the old planner still parses", () => {
  const stored = parseStoredPlanArtifact(JSON.stringify({ assessment: { classification: "cohesive", rationale: "One loop.", assetReceipt: { eagerModelIds: ["soldier"], eagerSharedAssetIds: [] } }, readinessPolicyVersion: 1 }))
  assert.deepEqual(stored?.assetReceipt, { eagerModelIds: ["soldier"], eagerSharedAssetIds: [] })
})

test("a declared receipt is written, whatever build it is", () => {
  assert.equal(receiptAction({ receipt: { eagerModelIds: ["crate"], eagerSharedAssetIds: [] }, assets: toon, hasStoredReceipt: false }), "write")
})

test("a later build of a template game lifts the first build's eager-asset check, as a new plan used to", () => {
  assert.equal(receiptAction({ assets: { ...toon, requiresAssetReceipt: false }, hasStoredReceipt: true }), "clear")
})

test("the fresh build itself, and games with nothing stored, keep what they have", () => {
  assert.equal(receiptAction({ assets: toon, hasStoredReceipt: true }), "keep")
  assert.equal(receiptAction({ assets: { ...toon, requiresAssetReceipt: false }, hasStoredReceipt: false }), "keep")
  assert.equal(receiptAction({ assets: noTemplate, hasStoredReceipt: false }), "keep")
})
