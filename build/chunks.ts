const groups = new Map([
  ["react", "vendor-react"],
  ["react-dom", "vendor-react"],
  ["scheduler", "vendor-react"],
  ["react-router", "vendor-router"],
  ["react-router-dom", "vendor-router"],
  ["react-select", "vendor-select"],
]);

export const getVendorChunk = (id: string): string | undefined => {
  const packagePath = id.replaceAll("\\", "/").split("/node_modules/").at(-1);
  if (!packagePath || packagePath === id.replaceAll("\\", "/")) return undefined;
  return groups.get(packagePath.split("/")[0]);
};
