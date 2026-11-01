import { paintFromBase64, paintToBase64 } from "../paint/paint-wire.ts"
import {
  Phase,
  RoundGuessType,
  type GameView,
  type LobbyGameView,
  type GuessingGameView,
  type PaintSubmission,
  type PaintedGuess,
  type PassedGuess,
  type ResultsGameView,
  type RevealGameView,
  type RevealView,
  type RoundReveal,
  type RoundResultView,
  type RoundYouView
} from "./views.ts"

export const ServerTopics = {
  state: "state",
  /** A round's RoundReveal, once per connection, before the first state that shows it. */
  reveal: "reveal",
  /** Your own paint, in binary, when you join mid-round: a refresh gets back what was painted. */
  paint: "paint",
  error: "error",
  /** The answer to a ping, so a client can tell a live connection from one that died without closing. */
  pong: "pong"
} as const
export type ServerTopic = (typeof ServerTopics)[keyof typeof ServerTopics]

/** Of the reveal, what the state topic carries: only what changes while it shows. */
type RevealProgress = Pick<RevealView, "index" | "ready">

/** A guessing view as the state topic carries it: your paint goes on its own topic. */
interface GuessingStateMessage extends Omit<GuessingGameView, "you"> {
  you: RoundYouView
}

/** A reveal as the state topic carries it: the bulk of it goes once, on the reveal topic. */
interface RevealStateMessage extends Omit<RevealGameView, "reveal"> {
  reveal: RevealProgress
}

export type StateMessage = LobbyGameView | GuessingStateMessage | RevealStateMessage | ResultsGameView

export const stateMessage = (view: GameView): StateMessage => {
  switch (view.phase) {
    case Phase.GUESSING: {
      const { paint: _paint, ...you } = view.you
      return { ...view, you }
    }
    case Phase.REVEAL:
      return { ...view, reveal: { index: view.reveal.index, ready: view.reveal.ready } }
    case Phase.LOBBY:
    case Phase.RESULTS:
      return view
  }
}

/**
 * The view a state message stands for, given the reveal and paint received
 * since connecting; undefined for a reveal's state that came before its
 * reveal, which the server never sends.
 */
export const viewFrom = (
  state: StateMessage,
  reveal: RoundReveal | undefined,
  paint: PaintSubmission | undefined
): GameView | undefined => {
  switch (state.phase) {
    case Phase.GUESSING:
      return paint ? { ...state, you: { ...state.you, paint } } : state
    case Phase.REVEAL:
      return reveal?.index === state.reveal.index
        ? { ...state, reveal: { ...reveal, ready: state.reveal.ready } }
        : undefined
    case Phase.LOBBY:
    case Phase.RESULTS:
      return state
  }
}

/** A RoundReveal as the reveal topic carries it: JSON, with each paint as base64 binary. */
export type RevealMessage = Omit<RoundReveal, "results"> & {
  results: (Omit<RoundResultView, "guess"> & {
    guess: PassedGuess | (Omit<PaintedGuess, "paint"> & { paint: string })
  })[]
}

export const revealMessage = (reveal: RoundReveal): RevealMessage => ({
  ...reveal,
  results: reveal.results.map(({ guess, ...result }) => ({
    ...result,
    guess: guess.type === RoundGuessType.PAINTED ? { ...guess, paint: paintToBase64(guess.paint) } : guess
  }))
})

export const revealFrom = (message: RevealMessage): RoundReveal => ({
  ...message,
  results: message.results.map(({ guess, ...result }) => {
    if (guess.type === RoundGuessType.PASSED) return { ...result, guess }
    const paint = paintFromBase64(guess.paint)
    return { ...result, guess: paint ? { ...guess, paint } : { type: RoundGuessType.PASSED } }
  })
})

export const encodeMessage = (value: unknown): string => JSON.stringify(value)

export const decodeMessage = (payload: Uint8Array | string): unknown => {
  const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload)
  return JSON.parse(text) as unknown
}
