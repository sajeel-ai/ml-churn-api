import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "coverage/**"] },
  // react-hook-form's watch() is flagged as "incompatible" with the React Compiler.
  // It only means those components are not auto-memoised; behaviour is unaffected.
  { rules: { "react-hooks/incompatible-library": "off" } },
];
export default config;
