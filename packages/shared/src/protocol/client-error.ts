import { z } from "zod"

/** Where players' browsers send what went wrong in them. */
export const CLIENT_ERRORS_PATH = "/api/client-errors"

export enum ClientErrorKind {
  MAP_LOAD = "MAP_LOAD",
  OUTLINES_LOAD = "OUTLINES_LOAD",
  DATA_LOAD = "DATA_LOAD",
  SOUND_LOAD = "SOUND_LOAD",
  VR_LOAD = "VR_LOAD",
  VR_CODE = "VR_CODE",
  WEBGL = "WEBGL",
  UNCAUGHT = "UNCAUGHT",
  UNHANDLED_REJECTION = "UNHANDLED_REJECTION"
}

export const MAX_MESSAGE_LENGTH = 500
export const MAX_STACK_LENGTH = 2000
export const MAX_SCREEN_LENGTH = 100
export const MAX_BUILD_LENGTH = 100
export const MAX_ROOM_LENGTH = 10

export const ClientErrorReportSchema = z.strictObject({
  kind: z.enum(ClientErrorKind),
  message: z.string().max(MAX_MESSAGE_LENGTH),
  stack: z.string().max(MAX_STACK_LENGTH).optional(),
  /** The route the player was on, without its query. */
  screen: z.string().max(MAX_SCREEN_LENGTH),
  /** The client's bundle, named by its hashed file. */
  build: z.string().max(MAX_BUILD_LENGTH).optional(),
  room: z.string().max(MAX_ROOM_LENGTH).optional()
})

export type ClientErrorReport = z.infer<typeof ClientErrorReportSchema>
