export function composesErrors(module: {
  file: string
  css: string
  exports: Record<string, { name: string; composes: { type: string; name: string; specifier?: string }[] }>
  lookup: (specifier: string) => string[] | undefined
}): string[]
