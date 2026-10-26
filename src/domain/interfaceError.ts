export const getInterfaceErrorKind = (error: unknown): "module" | "render" => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "";
  // Browsers and bundlers report failed dynamic imports with different messages.
  return /ChunkLoadError|Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message) ? "module" : "render";
};
