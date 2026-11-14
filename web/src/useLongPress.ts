import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react"

type Options = {
  onLongPress: (row: HTMLElement) => void
  delayMs?: number
  moveTolerancePx?: number
  enabled?: boolean
}

/**
 * Long-press for the Session rail. The handlers are attached to the scrolling list rather than to
 * every row: one timer serves the whole list, pointer movement/scroll cancels it, and the click
 * that follows a successful long-press is consumed so it does not also open the Session.
 */
export function useLongPress({
  onLongPress,
  delayMs = 550,
  moveTolerancePx = 10,
  enabled = true
}: Options) {
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ pointerId: number; x: number; y: number; row: HTMLElement } | null>(null)
  const suppressKey = useRef<string | null>(null)
  const detachRef = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current)
      timer.current = undefined
    }
    detachRef.current?.()
    detachRef.current = null
    origin.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.defaultPrevented) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest<HTMLElement>(".hr-native-session-row[data-session-key]")
    if (!row) return

    cancel()
    suppressKey.current = null
    origin.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, row }

    const finish = () => {
      cancel()
    }
    const move = (moveEvent: PointerEvent) => {
      const current = origin.current
      if (!current || moveEvent.pointerId !== current.pointerId) return
      if (Math.hypot(moveEvent.clientX - current.x, moveEvent.clientY - current.y) > moveTolerancePx) finish()
    }
    const detach = () => {
      window.removeEventListener("pointerup", finish, true)
      window.removeEventListener("pointercancel", finish, true)
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("scroll", finish, true)
    }

    window.addEventListener("pointerup", finish, true)
    window.addEventListener("pointercancel", finish, true)
    window.addEventListener("pointermove", move, true)
    window.addEventListener("scroll", finish, true)
    detachRef.current = detach

    timer.current = window.setTimeout(() => {
      timer.current = undefined
      detach()
      detachRef.current = null
      const current = origin.current
      origin.current = null
      if (!current) return
      suppressKey.current = current.row.dataset.sessionKey ?? null
      onLongPress(current.row)
    }, delayMs)
  }, [cancel, delayMs, enabled, moveTolerancePx, onLongPress])

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!enabled) return
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest<HTMLElement>(".hr-native-session-row[data-session-key]")
    if (!row) return
    event.preventDefault()
    cancel()
    suppressKey.current = row.dataset.sessionKey ?? null
    onLongPress(row)
  }, [cancel, enabled, onLongPress])

  const consumeClick = useCallback((key: string): boolean => {
    if (suppressKey.current !== key) return false
    suppressKey.current = null
    return true
  }, [])

  return { onPointerDown, onContextMenu, consumeClick }
}
