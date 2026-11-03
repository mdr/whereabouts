/** The commit this bundle was built from (the Nix build sets it), or "dev". */
export const CLIENT_BUILD: string = import.meta.env.VITE_BUILD ?? "dev"
