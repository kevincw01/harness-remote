import assert from "node:assert/strict"
import test from "node:test"
import {
  OUTCOME_DISMISSALS_STORAGE_KEY,
  dismissOutcome,
  isOutcomeDismissed,
  outcomeSessionKey,
  readOutcomeDismissals
} from "./native-session-outcome-dismissal.ts"

const ref = {
  machineID: "machine_1",
  agentID: "omp",
  sessionID: "session_1",
  directory: "/repo"
}

function fakeStorage() {
  const values = new Map()
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, value)
    }
  }
}

test("outcome dismissal is tied to one session and one outcome signature", () => {
  const storage = fakeStorage()
  const completed = "completed|0 files"

  assert.equal(isOutcomeDismissed(ref, completed, storage), false)
  dismissOutcome(ref, completed, storage)

  assert.equal(isOutcomeDismissed(ref, completed, storage), true)
  assert.equal(isOutcomeDismissed({ ...ref, sessionID: "other" }, completed, storage), false)
  assert.equal(isOutcomeDismissed(ref, "completed|2 files", storage), false)
})

test("a new outcome replaces the dismissed signature for the same session", () => {
  const storage = fakeStorage()
  dismissOutcome(ref, "completed|0 files", storage)
  dismissOutcome(ref, "completed|2 files", storage)

  assert.equal(isOutcomeDismissed(ref, "completed|0 files", storage), false)
  assert.equal(isOutcomeDismissed(ref, "completed|2 files", storage), true)
})

test("empty signatures and malformed state cannot hide an outcome", () => {
  const storage = fakeStorage()
  dismissOutcome(ref, "", storage)
  assert.equal(isOutcomeDismissed(ref, "", storage), false)

  storage.values.set(OUTCOME_DISMISSALS_STORAGE_KEY, "not json")
  assert.deepEqual(readOutcomeDismissals(storage), {})

  storage.values.set(OUTCOME_DISMISSALS_STORAGE_KEY, JSON.stringify({
    "not-a-session-key": "signature",
    [outcomeSessionKey(ref)]: "signature"
  }))
  assert.deepEqual(readOutcomeDismissals(storage), { [outcomeSessionKey(ref)]: "signature" })
})

test("an unavailable localStorage dismisses for the current launch", () => {
  dismissOutcome(ref, "completed|0 files", null)
  assert.equal(isOutcomeDismissed(ref, "completed|0 files", null), true)
  assert.equal(isOutcomeDismissed(ref, "completed|1 file", null), false)
})
