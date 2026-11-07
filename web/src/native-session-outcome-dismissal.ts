import type { NativeSessionIdentityPayload } from "./api"

/**
 * Per-device dismissal of the Session outcome panel.
 *
 * The outcome is live evidence, so dismissal is keyed by the Session and by the displayed outcome
 * signature. A later completed turn with different evidence changes the signature and shows the
 * panel again; merely refreshing the same result keeps it dismissed.
 */
export const OUTCOME_DISMISSALS_STORAGE_KEY = "harness-remote.outcome-dismissed.v1"

const MAX_DISMISSALS = 200
const KEY_SEPARATOR = "\u0000"

export type OutcomeDismissalMap = Record<string, string>

export type OutcomeStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const memoryDismissals = new Map<string, string>()

function browserStorage(): OutcomeStorage | null {
  try {
    if (typeof localStorage === "undefined") return null
    return localStorage
  } catch {
    return null
  }
}

function validSessionKey(value: string): boolean {
  return value.split(KEY_SEPARATOR).length === 3
    && value.split(KEY_SEPARATOR).every((part) => part.length > 0)
}

function sanitize(value: unknown): OutcomeDismissalMap {
  const result: OutcomeDismissalMap = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return result
  for (const [key, signature] of Object.entries(value)) {
    if (validSessionKey(key) && typeof signature === "string" && signature) result[key] = signature
  }
  return result
}

function fromMemory(): OutcomeDismissalMap {
  const result: OutcomeDismissalMap = {}
  for (const [key, signature] of memoryDismissals) result[key] = signature
  return result
}

function remember(map: OutcomeDismissalMap): OutcomeDismissalMap {
  memoryDismissals.clear()
  for (const [key, signature] of Object.entries(map)) memoryDismissals.set(key, signature)
  return map
}

function bounded(map: OutcomeDismissalMap): OutcomeDismissalMap {
  const keys = Object.keys(map)
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_DISMISSALS))) delete map[key]
  return map
}

export function outcomeSessionKey(ref: Pick<NativeSessionIdentityPayload, "machineID" | "agentID" | "sessionID">): string {
  return [ref.machineID, ref.agentID, ref.sessionID].join(KEY_SEPARATOR)
}

export function readOutcomeDismissals(storage: OutcomeStorage | null = browserStorage()): OutcomeDismissalMap {
  if (!storage) return fromMemory()
  try {
    const raw = storage.getItem(OUTCOME_DISMISSALS_STORAGE_KEY)
    if (!raw) return remember({})
    return remember(sanitize(JSON.parse(raw)))
  } catch {
    return remember({})
  }
}

export function isOutcomeDismissed(
  ref: Pick<NativeSessionIdentityPayload, "machineID" | "agentID" | "sessionID">,
  signature: string,
  storage: OutcomeStorage | null = browserStorage()
): boolean {
  if (!signature) return false
  return readOutcomeDismissals(storage)[outcomeSessionKey(ref)] === signature
}

export function dismissOutcome(
  ref: Pick<NativeSessionIdentityPayload, "machineID" | "agentID" | "sessionID">,
  signature: string,
  storage: OutcomeStorage | null = browserStorage()
): OutcomeDismissalMap {
  const next = readOutcomeDismissals(storage)
  if (signature) next[outcomeSessionKey(ref)] = signature
  const boundedNext = remember(bounded(next))
  if (storage) {
    try {
      storage.setItem(OUTCOME_DISMISSALS_STORAGE_KEY, JSON.stringify(boundedNext))
    } catch {
      // Keep the in-memory dismissal when the WebView cannot persist it.
    }
  }
  return { ...boundedNext }
}
