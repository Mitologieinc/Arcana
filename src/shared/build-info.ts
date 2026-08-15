export const UPSTREAM_REPO = "Mitologieinc/Arcana";

export const BUILD_INFO = {
  version: typeof __ARCANA_VERSION__ === "string" ? __ARCANA_VERSION__ : "0.1.0",
  commit: typeof __ARCANA_COMMIT__ === "string" ? __ARCANA_COMMIT__ : "",
  builtAt: typeof __ARCANA_BUILT_AT__ === "string" ? __ARCANA_BUILT_AT__ : "",
};

export function shortSha(sha: string) {
  return sha.slice(0, 7);
}
