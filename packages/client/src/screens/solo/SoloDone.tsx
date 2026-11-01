import { Banner } from "../../ui/Banner/Banner"
import { Hud, HudCenter } from "../../ui/map/Hud/Hud"
import { Icon } from "../../ui/icons"
import kit from "../../ui/kit.module.css"
import scoreStyles from "../../ui/round/Score.module.css"
import { VrButton } from "../../ui/VrButton/VrButton"
import type { VrView } from "../../vr/view/view"
import { runMaximum, runTotal, type PracticeRun } from "../../round/practice-run"

/** Practice's final score and its rounds, with a fresh run to start. */
export function SoloDone({ run, restart, vrView }: { run: PracticeRun; restart: () => void; vrView: VrView }) {
  return (
    <Hud>
      <HudCenter>
        <div class={kit.pageCard}>
          <Banner />
          <div class={scoreStyles.score}>
            <div class={scoreStyles.label}>Final score</div>
            <div class={scoreStyles.big}>{Math.round(runTotal(run)).toLocaleString()}</div>
            <div class={scoreStyles.label}>out of {runMaximum(run).toLocaleString()}</div>
          </div>
          <ul class={kit.results}>
            {run.results.map((result, i) => (
              <li key={i}>
                <span>{result.question.label}</span>
                <span>{Math.round(result.score)}</span>
              </li>
            ))}
          </ul>
          <button class="primary big" onClick={restart}>
            <Icon name="refresh" /> Play again
          </button>
          <VrButton view={vrView} />
          <p class={kit.hint}>
            <a href="#/">Leave</a>
          </p>
        </div>
      </HudCenter>
    </Hud>
  )
}
