/**
 * Plays one game with scripted players who all paint at the cell budget as
 * often as a client may upload, then lock in together, and reports what the
 * server went through: event-loop delay, memory and CPU while painting and at
 * each reveal, ping round trips, and how long each reveal took to arrive.
 *
 *   node --experimental-transform-types scripts/load/load-test.ts --players 16 --spectators 8
 *
 * Starts its own server unless given --url (then only client-side numbers).
 */
import { fork, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import { evenMix, mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { Phase } from "@whereabouts/shared/protocol/views"
import { Role } from "@whereabouts/shared/roles"
import { GameEntryType } from "@whereabouts/shared/protocol/ticket"
import { encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { bigPaint } from "./big-paint.ts"
import { Bot } from "./bot.ts"
import type { ProbeSample } from "./server-probe.ts"
import { formatSummary, mebibytes, summarise } from "./stats.ts"

const UPLOAD_INTERVAL_MS = 400
const ROUND_LENGTH_MS = 120_000

const { values } = parseArgs({
  options: {
    players: { type: "string", default: "16" },
    spectators: { type: "string", default: "8" },
    rounds: { type: "string", default: "3" },
    "paint-seconds": { type: "string", default: "6" },
    /** Ask only this question type (LANDMARK, PLACE, COUNTRY, FLAG, FEATURE, STATE), not an even mix. */
    type: { type: "string" },
    port: { type: "string", default: "8899" },
    url: { type: "string" }
  }
})
const players = Number(values.players)
const spectators = Number(values.spectators)
const rounds = Number(values.rounds)
const paintMs = Number(values["paint-seconds"]) * 1000
const onlyType = values.type === undefined ? undefined : QuestionType[values.type as keyof typeof QuestionType]
if (values.type !== undefined && onlyType === undefined) throw new Error(`unknown question type ${values.type}`)
const mix = onlyType === undefined ? evenMix(rounds) : mixOf({ [onlyType]: rounds })

const samples: ProbeSample[] = []

const startServer = async (port: string): Promise<ChildProcess> => {
  const server = fork(fileURLToPath(new URL("../../src/main.ts", import.meta.url)), [], {
    execArgv: ["--experimental-transform-types", "--import", new URL("./server-probe.ts", import.meta.url).href],
    env: { ...process.env, PORT: port, HOST: "127.0.0.1", STATIC_DIR: "", CONNECTIONS_PER_ADDRESS: "1000" },
    stdio: ["ignore", "ignore", "inherit", "ipc"]
  })
  server.on("message", (sample) => samples.push(sample as ProbeSample))
  const start = Date.now()
  while (Date.now() - start < 15_000) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return server
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  server.kill()
  throw new Error("server did not start")
}

const server = values.url === undefined ? await startServer(values.port) : undefined
const url = values.url ?? `ws://127.0.0.1:${values.port}/ws`

const samplesIn = (from: number, to: number) => samples.filter((sample) => sample.at > from && sample.at <= to + 1000)

const serverLine = (from: number, to: number): string => {
  const window = samplesIn(from, to)
  if (window.length === 0) return "server: no samples"
  const eventLoopMax = Math.max(...window.map((sample) => sample.eventLoopMaxMs))
  const rss = Math.max(...window.map((sample) => sample.rss))
  const heap = Math.max(...window.map((sample) => sample.heapUsed))
  const buffers = Math.max(...window.map((sample) => sample.arrayBuffers))
  const cpu = Math.max(...window.map((sample) => sample.cpu))
  return `server: event loop max ${eventLoopMax.toFixed(0)} ms, peak CPU ${(cpu * 100).toFixed(0)}%, peak RSS ${mebibytes(rss)}, peak heap ${mebibytes(heap)}, peak buffers ${mebibytes(buffers)}`
}

const pingLine = (bots: readonly Bot[], from: number, to: number): string =>
  `ping: ${formatSummary(
    summarise(
      bots
        .flatMap((bot) => bot.pings.filter((ping) => ping.sentAt >= from && ping.sentAt <= to))
        .map((ping) => ping.roundTripMs)
    ),
    " ms"
  )}`

const hostBot = new Bot(url, "Host")
const playerBots = [hostBot, ...Array.from({ length: players - 1 }, (_, i) => new Bot(url, `Player${i + 1}`))]
const spectatorBots = Array.from({ length: spectators }, (_, i) => new Bot(url, `Watcher${i + 1}`))
const everyone = [...playerBots, ...spectatorBots]
const paints = playerBots.map((_, i) => encodePaint(bigPaint(i)))

try {
  hostBot.connect({ type: GameEntryType.HOST })
  const lobby = await hostBot.until((state) => state.phase === Phase.LOBBY, "the lobby")
  if (lobby.phase !== Phase.LOBBY) throw new Error("not in the lobby")
  hostBot.send(ClientTopic.CONFIGURE, { roundLength: ROUND_LENGTH_MS, mix })
  for (const bot of playerBots.slice(1)) bot.connect({ type: GameEntryType.JOIN, code: lobby.code, role: Role.PLAYER })
  for (const bot of spectatorBots) bot.connect({ type: GameEntryType.JOIN, code: lobby.code, role: Role.SPECTATOR })
  await hostBot.until(
    (state) => state.players.length === players && state.spectators.length === spectators,
    `${players} players and ${spectators} spectators`
  )

  console.log(
    `${players} players, ${spectators} spectators, ${rounds} rounds; each upload ${mebibytes(paints[0]!.byteLength)} every ${UPLOAD_INTERVAL_MS} ms for ${paintMs / 1000} s`
  )
  const idleFrom = Date.now()
  await new Promise((resolve) => setTimeout(resolve, 2000))
  console.log(`idle lobby — ${serverLine(idleFrom, Date.now() - 1000)}`)

  hostBot.send(ClientTopic.START)
  for (let round = 0; round < rounds; round++) {
    const [guessing] = await Promise.all(
      playerBots.map((bot) =>
        bot.until((state) => state.phase === Phase.GUESSING && state.round.index === round, `round ${round + 1}`)
      )
    )
    const questionType = guessing?.phase === Phase.GUESSING ? guessing.round.question.type : "?"
    const paintFrom = Date.now()
    const uploaders = playerBots.map((bot, i) => {
      bot.sendPaint(paints[i]!)
      return setInterval(() => bot.sendPaint(paints[i]!), UPLOAD_INTERVAL_MS)
    })
    await new Promise((resolve) => setTimeout(resolve, paintMs))
    for (const uploader of uploaders) clearInterval(uploader)
    for (const bot of playerBots) bot.send(ClientTopic.LOCK)
    const lockedAt = Date.now()

    await Promise.all(
      everyone.map((bot) => bot.until(() => bot.reveals.length === round + 1, `round ${round + 1}'s reveal`, 60_000))
    )
    const arrivals = everyone.map((bot) => bot.reveals[round]!)
    const lastArrival = Math.max(...arrivals.map((arrival) => arrival.at))
    // Let the probe report the reveal's second before reading it.
    await new Promise((resolve) => setTimeout(resolve, 1100))

    console.log(`\nround ${round + 1}: ${questionType}`)
    console.log(`  painting — ${serverLine(paintFrom, lockedAt)}`)
    console.log(`             ${pingLine(everyone, paintFrom, lockedAt)}`)
    console.log(
      `  reveal   — ${mebibytes(arrivals[0]!.bytes)} to each of ${everyone.length} (${mebibytes(arrivals.reduce((sum, arrival) => sum + arrival.bytes, 0))} in all)`
    )
    console.log(
      `             arrived after the last lock: ${formatSummary(summarise(arrivals.map((arrival) => arrival.at - lockedAt)), " ms")}`
    )
    console.log(`             ${serverLine(lockedAt, lastArrival)}`)
    console.log(`             ${pingLine(everyone, lockedAt, lastArrival)}`)

    for (const bot of playerBots) bot.send(ClientTopic.READY)
  }
  await hostBot.until((state) => state.phase === Phase.RESULTS, "the results")

  const errors = everyone.flatMap((bot) => bot.errors.map((error) => `${bot.name}: ${error}`))
  if (errors.length > 0) console.log(`\nerrors from the server:\n  ${errors.join("\n  ")}`)
} finally {
  for (const bot of everyone) bot.disconnect()
  server?.kill()
}
