import { useEffect, useRef, useState } from "react"

/** Decode image data only when the image approaches the viewport, not while the transcript loads. */
export function LazyImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const image = imageRef.current
    if (!image || typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: "500px 0px" })
    observer.observe(image)
    return () => observer.disconnect()
  }, [])

  return (
    <img
      ref={imageRef}
      className={className}
      src={visible ? src : undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
    />
  )
}
