import type { NativeSessionIdentityPayload } from "./api"
import type { NativeSessionLineageEntry } from "./native-session-lineage"

/**
 * Per-device dismissal of the read-only handoff lineage panel.
 *
 * Lineage is durable bridge evidence, so the daemon has no delete operation for it and the app must
 * not pretend to remove it from the link graph. What the user can dismiss is the panel on this
 * device. The value stored per Session is a signature of the currently displayed edges, not a
 * boolean: a new handoff edge changes the signature and the panel returns. Nothing from
 * `transferredContext` or portable state is stored.
 */
export const LINEAGE_DISMISSALS_STORAGE_KEY = "harness-remote.lineage-dismissed.v1"

const MAX_DISMISSALS = 200
const SESSION_KEY_SEPARATOR = "\u0000"
const ENTRY_SEPARATOR = "\u0001"
const SIGNATURE_SEPARATOR = "\u0002"

export type LineageDismissalMap = Record<string, string>

export type LineageStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const memoryDismissals = new Map<string, string>()
const listeners = new Set<() => void>()
let snapshot: LineageDismissalMap | null = null

function browserStorage(): LineageStorage | null {
  try {
    if (typeof localStorage === "undefined") return null
    return localStorage
  } catch {
    return null
  }
}

function validSessionKey(value: string): boolean {
  return value.split(SESSION_KEY_SEPARATOR).length === 3
    && value.split(SESSION_KEY_SEPARATOR).every((part) => part.length > 0)
}

function sanitize(value: unknown): LineageDismissalMap {
  const result: LineageDismissalMap = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return result
  for (const [key, signature] of Object.entries(value)) {
    if (validSessionKey(key) && typeof signature === "string" && signature) result[key] = signature
  }
  return result
}

function fromMemory(): LineageDismissalMap {
  const result: LineageDismissalMap = {}
  for (const [key, signature] of memoryDismissals) result[key] = signature
  return result
}

function remember(map: LineageDismissalMap): LineageDismissalMap {
  memoryDismissals.clear()
  for (const [key, signature] of Object.entries(map)) memoryDismissals.set(key, signature)
  return map
}

function bounded(map: LineageDismissalMap): LineageDismissalMap {
  const keys = Object.keys(map)
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_DISMISSALS))) delete map[key]
  return map
}

export function lineageSessionKey(ref: Pick<NativeSessionIdentityPayload, "machineID" | "agentID" | "sessionID">): string {
  return [ref.machineID, ref.agentID, ref.sessionID].join(SESSION_KEY_SEPARATOR)
}

/**
 * Identity of the exact set of edges currently shown for one Session. Ordering is irrelevant; a new
 * edge (or a new createdAt for the same edge) produces a different signature and reopens the panel.
 */
export function lineageSignature(entries: NativeSessionLineageEntry[]): string {
  return entries
    .map((entry) => [
      entry.direction,
      entry.other.machineID,
      entry.other.agentID,
      entry.other.sessionID,
      entry.createdAt,
      entry.contextCarried ? "context" : "no-context"
    ].join(ENTRY_SEPARATOR))
    .sort()
    .join(SIGNATURE_SEPARATOR)
}

export function readLineageDismissals(storage: LineageStorage | null = browserStorage()): LineageDismissalMap {
  if (!storage) return fromMemory()
  try {
    const raw = storage.getItem(LINEAGE_DISMISSALS_STORAGE_KEY)
    if (!raw) return remember({})
    return remember(sanitize(JSON.parse(raw)))
  } catch {
    return remember({})
  }
}

/**
 * Shared snapshot for the two independently mounted lineage surfaces: the linked-Session strip in
 * the workspace header and the handoff panel inside the observer. One dismiss must hide both.
 */
export function getLineageDismissalsSnapshot(): LineageDismissalMap {
  if (!snapshot) snapshot = readLineageDismissals()
  return snapshot
}

export function subscribeLineageDismissals(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function publish(next: LineageDismissalMap): void {
  snapshot = next
  for (const listener of listeners) listener()
}

export function isLineageDismissed(
  ref: Pick<NativeSessionIdentityPayload, "machineID" | "agentID" | "sessionID">,
  entries: NativeSessionLineageEntry[],
  storage: LineageStorage | null = browserStorage()
): boolean {
  if (!entries.length) return false
  return readLineageDismissals(storage)[lineageSessionKey(ref)] === lineageSignature(entries)
}

export function dismissLineage(
  ref: Pick<NativeSessionIdentityPayload, "machineID" | "agentID" | "sessionID">,
  entries: NativeSessionLineageEntry[],
  storage: LineageStorage | null = browserStorage()
): LineageDismissalMap {
  const next = readLineageDismissals(storage)
  if (entries.length) next[lineageSessionKey(ref)] = lineageSignature(entries)
  const boundedNext = remember(bounded(next))
  if (storage) {
    try {
      storage.setItem(LINEAGE_DISMISSALS_STORAGE_KEY, JSON.stringify(boundedNext))
    } catch {
      // A private-mode or quota-limited WebView still gets the in-memory dismissal for this launch.
    }
  }
  const result = { ...boundedNext }
  publish(result)
  return result
}
