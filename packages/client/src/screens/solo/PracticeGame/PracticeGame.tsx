import { useEffect, useState } from "preact/hooks"
import { playerName } from "@whereabouts/shared/ids"
import type { Outlines, Question } from "@whereabouts/shared/questions"
import { PracticeGameService } from "../../../game-service/practice-game-service"
import { GameServiceProvider } from "../../../game-service/use-game-service"
import { nameToJoin, savedName, soloKernelId, soloMapDetail } from "../../../settings/settings"
import { GameScreen } from "../../GameScreen/GameScreen"

/** One run of practice: a PracticeGameService from the moment this mounts to when it unmounts. */
export const PracticeGame = ({ pool, outlines }: { pool: Question[]; outlines: Outlines }) => {
  const [service] = useState(
    () =>
      new PracticeGameService({
        pool,
        outlines,
        mapDetail: soloMapDetail.value,
        kernelId: soloKernelId.value,
        name: nameToJoin(savedName.value) ?? playerName("You")
      })
  )
  useEffect(() => {
    service.begin()
    return () => service.dispose()
  }, [service])
  const view = service.view.value
  if (!view) return undefined
  return (
    <GameServiceProvider value={service}>
      <GameScreen view={view} />
    </GameServiceProvider>
  )
}
