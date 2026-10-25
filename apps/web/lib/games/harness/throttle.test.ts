import assert from "node:assert/strict"
import { test } from "node:test"

import { createThrottle } from "./throttle"

function clock() {
  let now = 0
  const timers: { at: number; fn: () => void }[] = []
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const timer = { at: now + ms, fn }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer: unknown) => {
      const index = timers.indexOf(timer as (typeof timers)[number])
      if (index !== -1) timers.splice(index, 1)
    },
    advance(ms: number) {
      now += ms
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
        if (timer.at > now) continue
        timers.splice(timers.indexOf(timer), 1)
        timer.fn()
      }
    },
  }
}

test("the first call runs at once", () => {
  const time = clock()
  let runs = 0
  createThrottle(() => runs++, 1000, time).call()
  assert.equal(runs, 1)
})

test("a burst inside the interval runs once more, at its end", () => {
  const time = clock()
  let runs = 0
  const throttle = createThrottle(() => runs++, 1000, time)

  throttle.call()
  time.advance(200)
  throttle.call()
  throttle.call()
  assert.equal(runs, 1)

  time.advance(800)
  assert.equal(runs, 2)
})

test("a call after the interval has passed runs at once", () => {
  const time = clock()
  let runs = 0
  const throttle = createThrottle(() => runs++, 1000, time)

  throttle.call()
  time.advance(1500)
  throttle.call()
  assert.equal(runs, 2)
})

test("cancel drops the pending run and every later call", () => {
  const time = clock()
  let runs = 0
  const throttle = createThrottle(() => runs++, 1000, time)

  throttle.call()
  throttle.call()
  throttle.cancel()
  time.advance(2000)
  throttle.call()
  assert.equal(runs, 1)
})
