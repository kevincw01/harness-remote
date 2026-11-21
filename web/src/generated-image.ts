import { Capacitor, registerPlugin } from "@capacitor/core"

type GeneratedImagePlugin = {
  open(options: { dataURL: string; filename: string; mime: string }): Promise<void>
  save(options: { dataURL: string; filename: string; mime: string }): Promise<{ saved: boolean; location?: string }>
}

const nativePlugin = registerPlugin<GeneratedImagePlugin>("GeneratedImage")

function dataURLParts(dataURL: string): { mime: string; base64: string } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataURL)
  if (!match) throw new Error("The generated image has no base64 data.")
  return { mime: match[1], base64: match[2] }
}

function blobFor(dataURL: string): Blob {
  const { mime, base64 } = dataURLParts(dataURL)
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

export async function openGeneratedImage(dataURL: string, filename: string): Promise<void> {
  const { mime } = dataURLParts(dataURL)
  if (Capacitor.getPlatform() === "android") {
    await nativePlugin.open({ dataURL, filename, mime })
    return
  }
  const url = URL.createObjectURL(blobFor(dataURL))
  window.open(url, "_blank", "noopener,noreferrer")
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function saveGeneratedImage(dataURL: string, filename: string): Promise<string> {
  const { mime } = dataURLParts(dataURL)
  if (Capacitor.getPlatform() === "android") {
    const result = await nativePlugin.save({ dataURL, filename, mime })
    return result.location || "Saved to Pictures/Harness Remote"
  }
  const url = URL.createObjectURL(blobFor(dataURL))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return "Downloaded"
}
