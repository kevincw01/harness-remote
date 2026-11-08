import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { api } from "../api"
import { CloseIcon, LoadingIcon, PencilIcon, TrashIcon } from "../Icons"
import type { NativeSessionSurfaceTarget } from "../native-session-discovery"
import type { Session } from "../types"
import { useDialogDismiss } from "../useDialogDismiss"
import { useTranslator } from "../useTranslator"
import "../native-session-row-actions.css"

type Props = {
  target: NativeSessionSurfaceTarget
  onClose: () => void
  onRenamed: (session: Session, title: string) => void
  onDeleteStarted?: (key: string) => void
  onDeleteFailed?: (key: string) => void
  onDeleted: (key: string) => void
}

type Mode = "menu" | "rename" | "delete"

export function NativeSessionRowActions({ target, onClose, onRenamed, onDeleteStarted, onDeleteFailed, onDeleted }: Props) {
  const t = useTranslator()
  const [mode, setMode] = useState<Mode>("menu")
  const [title, setTitle] = useState(target.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = () => {
    if (!busy) onClose()
  }

  useDialogDismiss(dialogRef, close)

  useEffect(() => {
    if (mode === "menu") return
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mode])

  async function rename() {
    if (busy) return
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError(t("sf.enterSessionName"))
      inputRef.current?.focus()
      return
    }
    if (nextTitle === target.title) {
      close()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const session = await api.renameSession(target.config, target.sessionID, nextTitle, target.directory)
      onRenamed(session, nextTitle)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setError(null)
    onDeleteStarted?.(target.key)
    try {
      await api.deleteSession(target.config, target.sessionID, target.directory)
      onDeleted(target.key)
      onClose()
    } catch (reason) {
      onDeleteFailed?.(target.key)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <>
      <div className="hr-session-row-actions-backdrop" onClick={close} />
      <div
        ref={dialogRef}
        className="hr-session-row-actions"
        role="dialog"
        aria-modal="true"
        aria-label={target.title}
      >
        <header className="hr-session-row-actions-heading">
          <div>
            <strong>{target.title}</strong>
            <small>{target.agentLabel}</small>
          </div>
          <button type="button" className="tdw-icon-button" onClick={close} disabled={busy} aria-label={t("sf.cancel")} title={t("sf.cancel")}>
            <CloseIcon size={15} />
          </button>
        </header>

        {error ? <div className="hr-session-row-actions-error" role="alert">{error}</div> : null}

        {mode === "menu" ? (
          <div className="hr-session-row-actions-menu">
            {target.renameSupported ? (
              <button
                type="button"
                className="hr-session-row-action"
                data-autofocus
                onClick={() => { setError(null); setMode("rename") }}
              >
                <PencilIcon size={16} />
                <span>{t("sf.renameSession")}</span>
              </button>
            ) : null}
            {target.deleteSupported ? (
              <button
                type="button"
                className="hr-session-row-action danger"
                onClick={() => { setError(null); setMode("delete") }}
              >
                <TrashIcon size={16} />
                <span>{t("sf.deleteSession")}</span>
              </button>
            ) : null}
            <button type="button" className="tdw-button secondary hr-session-row-actions-cancel" onClick={close}>
              {t("sf.cancel")}
            </button>
          </div>
        ) : null}

        {mode === "rename" ? (
          <form
            className="hr-session-row-actions-form"
            onSubmit={(event) => { event.preventDefault(); void rename() }}
          >
            <label>
              <span>{t("sf.sessionName")}</span>
              <input
                ref={inputRef}
                value={title}
                data-autofocus
                disabled={busy}
                maxLength={200}
                spellCheck={false}
                aria-label={t("sf.sessionName")}
                onChange={(event) => { setTitle(event.target.value); if (error) setError(null) }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation()
                    setMode("menu")
                    setError(null)
                  }
                }}
              />
            </label>
            <small>{t("sf.renameSubtitle")}</small>
            <div className="hr-session-row-actions-buttons">
              <button type="button" className="tdw-button secondary" onClick={() => { setMode("menu"); setError(null) }} disabled={busy}>
                {t("sf.cancel")}
              </button>
              <button type="submit" className="tdw-button primary" disabled={busy || !title.trim()}>
                {busy ? <LoadingIcon size={14} /> : t("sf.rename")}
              </button>
            </div>
          </form>
        ) : null}

        {mode === "delete" ? (
          <div className="hr-session-row-actions-form">
            <strong>{t("sf.deleteSessionTitle", { title: target.title })}</strong>
            <small>{t(target.transport === "acp" ? "sf.hideSessionSubtitle" : "sf.deleteSubtitle", { agent: target.agentLabel })}</small>
            <div className="hr-session-row-actions-buttons">
              <button type="button" className="tdw-button secondary" data-autofocus onClick={close} disabled={busy}>
                {t("sf.keepSession")}
              </button>
              <button type="button" className="tdw-button danger" onClick={() => void remove()} disabled={busy}>
                {busy ? t("sf.deleting") : t("sf.deleteSession")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>,
    document.body
  )
}
