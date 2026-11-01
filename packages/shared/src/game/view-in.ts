import type { GameView, Phase } from "../protocol/views.ts"

/** For tests: a view of one phase, or a failure naming the phase it was in. */
export type GameViewIn<P extends Phase> = Extract<GameView, { phase: P }>

export const viewIn = <P extends Phase>(view: GameView | undefined, phase: P): GameViewIn<P> => {
  if (!view) throw new Error(`expected a ${phase} view, got none`)
  if (view.phase !== phase) throw new Error(`expected a ${phase} view, got ${view.phase}`)
  return view as GameViewIn<P>
}
