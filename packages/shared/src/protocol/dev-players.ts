/** The development server's endpoint for extra players, used by the client's dev drawer. */
export const DEV_PLAYERS_PATH = "/api/dev/players"

export enum DevPlayersAction {
  SEAT = "SEAT",
  PAINT = "PAINT"
}
