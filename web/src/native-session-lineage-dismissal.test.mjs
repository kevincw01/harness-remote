import assert from "node:assert/strict"
import test from "node:test"
import {
  LINEAGE_DISMISSALS_STORAGE_KEY,
  dismissLineage,
  getLineageDismissalsSnapshot,
  isLineageDismissed,
  lineageSessionKey,
  lineageSignature,
  readLineageDismissals,
  subscribeLineageDismissals
} from "./native-session-lineage-dismissal.ts"

const ref = {
  machineID: "machine_1",
  agentID: "omp",
  sessionID: "source-session",
  directory: "/repo"
}

function entry(createdAt, overrides = {}) {
  return {
    direction: "outgoing",
    other: {
      machineID: "machine_1",
      agentID: "codex",
      sessionID: "target-session",
      directory: "/repo"
    },
    createdAt,
    contextCarried: true,
    authority: "invalidated",
    targetAuthorization: "re_evaluate",
    attachments: "not_transferred",
    ...overrides
  }
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

test("lineage signature is stable across entry order and changes with a new edge", () => {
  const first = entry("2026-11-05T18:08:23.936Z")
  const second = entry("2026-11-06T10:00:00.000Z", {
    direction: "incoming",
    other: { machineID: "machine_2", agentID: "omp", sessionID: "other", directory: "/other" }
  })

  assert.equal(lineageSignature([first, second]), lineageSignature([second, first]))
  assert.notEqual(lineageSignature([first]), lineageSignature([first, second]))
})

test("dismissing one exact edge set does not hide a different session or a later handoff", () => {
  const storage = fakeStorage()
  const first = entry("2026-11-05T18:08:23.936Z")
  const second = entry("2026-11-06T10:00:00.000Z")

  assert.equal(isLineageDismissed(ref, [first], storage), false)

  const saved = dismissLineage(ref, [first], storage)
  assert.equal(saved[lineageSessionKey(ref)], lineageSignature([first]))
  assert.equal(isLineageDismissed(ref, [first], storage), true)

  assert.equal(isLineageDismissed({ ...ref, sessionID: "another" }, [first], storage), false)
  assert.equal(isLineageDismissed(ref, [first, second], storage), false)

  dismissLineage(ref, [first, second], storage)
  assert.equal(isLineageDismissed(ref, [first, second], storage), true)
  assert.equal(isLineageDismissed(ref, [first], storage), false)
})

test("malformed or foreign dismissal state is ignored", () => {
  const storage = fakeStorage()
  storage.values.set(LINEAGE_DISMISSALS_STORAGE_KEY, "not json")
  assert.deepEqual(readLineageDismissals(storage), {})

  storage.values.set(LINEAGE_DISMISSALS_STORAGE_KEY, JSON.stringify({
    "not-a-session-key": "signature",
    [lineageSessionKey(ref)]: "signature"
  }))
  assert.deepEqual(readLineageDismissals(storage), { [lineageSessionKey(ref)]: "signature" })
})

test("an unavailable localStorage still dismisses for the current launch", () => {
  const first = entry("2026-11-05T18:08:23.936Z")
  dismissLineage(ref, [first], null)
  assert.equal(isLineageDismissed(ref, [first], null), true)
  assert.equal(isLineageDismissed(ref, [entry("2026-11-07T00:00:00.000Z")], null), false)
})

test("one dismissal notifies every lineage surface sharing the store", () => {
  const first = entry("2026-11-05T18:08:23.936Z")
  let notifications = 0
  const unsubscribe = subscribeLineageDismissals(() => { notifications += 1 })
  try {
    const saved = dismissLineage(ref, [first], null)
    assert.equal(getLineageDismissalsSnapshot()[lineageSessionKey(ref)], saved[lineageSessionKey(ref)])
    assert.ok(notifications >= 1)
  } finally {
    unsubscribe()
  }
})
