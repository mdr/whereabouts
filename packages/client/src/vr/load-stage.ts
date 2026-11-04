/** How far loading VR has got, in order. */
export enum VrLoadStage {
  CODE = "CODE",
  HEADSET = "HEADSET",
  LAND = "LAND"
}
export const VR_LOAD_STAGES: readonly VrLoadStage[] = Object.values(VrLoadStage)
