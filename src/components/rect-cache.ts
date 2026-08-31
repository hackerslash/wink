export interface RectCache {
  readonly current: DOMRect
  invalidate(): void
  destroy(): void
}

/**
 * getBoundingClientRect() forces layout; canvasui effects read it on every
 * pointermove. Cache it and only invalidate on things that can move the element.
 */
export function createRectCache(element: HTMLElement): RectCache {
  let rect: DOMRect | null = null
  const invalidate = () => {
    rect = null
  }

  const observer = new ResizeObserver(invalidate)
  observer.observe(element)
  window.addEventListener("scroll", invalidate, true)
  window.addEventListener("resize", invalidate)

  return {
    get current() {
      if (!rect) rect = element.getBoundingClientRect()
      return rect
    },
    invalidate,
    destroy() {
      observer.disconnect()
      window.removeEventListener("scroll", invalidate, true)
      window.removeEventListener("resize", invalidate)
    },
  }
}
