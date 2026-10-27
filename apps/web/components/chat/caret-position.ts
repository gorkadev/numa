/** The text-layout properties a mirror must copy to wrap text as the text area does. */
const MIRRORED = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "letterSpacing",
  "lineHeight",
  "tabSize",
  "textIndent",
  "textTransform",
  "wordSpacing",
  "overflowWrap",
] as const

/**
 * Where a character of a text area sits, relative to the text area's own box
 * and after its scroll. A text area exposes no layout for its text, so an
 * invisible copy with the same width and type lays the text out the same way
 * and is measured instead — the usual technique, as there is no other one.
 */
export function caretPosition(textarea: HTMLTextAreaElement, index: number) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  for (const property of MIRRORED) mirror.style[property] = style[property]
  mirror.style.position = "absolute"
  mirror.style.visibility = "hidden"
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.overflow = "hidden"
  mirror.style.top = "0"
  mirror.style.left = "-9999px"
  mirror.textContent = textarea.value.slice(0, index)

  const marker = document.createElement("span")
  marker.textContent = textarea.value.slice(index) || "."
  mirror.append(marker)
  document.body.append(mirror)

  const position = {
    top: marker.offsetTop + parseFloat(style.borderTopWidth) - textarea.scrollTop,
    left: marker.offsetLeft + parseFloat(style.borderLeftWidth) - textarea.scrollLeft,
  }
  mirror.remove()
  return position
}
