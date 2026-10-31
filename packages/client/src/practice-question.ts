import type { Question } from "@whereabouts/shared/questions"
import type { RegionQuestion } from "@whereabouts/shared/regions"

export type PracticeQuestion = Question | RegionQuestion

export const isRegion = (q: PracticeQuestion): q is RegionQuestion => q.kind === "region"
