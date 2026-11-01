/** What setTimeout returns: a number in the browser, an object in Node. */
export type TimeoutHandle = ReturnType<typeof setTimeout>
