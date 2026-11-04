/** The option an arrow or Home/End key leads to, wrapping at the ends; undefined for other keys. */
export const radioTargetIndex = (key: string, current: number, count: number): number | undefined => {
  if (count <= 0) return undefined
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return undefined
  }
}

/** The option that is the group's one Tab stop: the checked one, else the first. */
export const radioTabStopIndex = (checkedIndex: number): number => Math.max(checkedIndex, 0)
