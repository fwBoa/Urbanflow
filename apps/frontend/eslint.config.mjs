import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // ─── Règles d'optimisation React 19 (eslint-plugin-react-hooks v6) ───
      // Ces deux règles sont des RECOMMANDATIONS de performance / d'optimisation
      // du React Compiler, et non des bugs de correction :
      //  • set-state-in-effect : un `setState` synchrone en début d'effect de
      //    data-fetching (ex. `setLoading(true)` avant un `fetch`). Pattern
      //    répandu et fonctionnellement correct ; le coût est au plus un
      //    re-render supplémentaire.
      //  • preserve-manual-memoization : le compiler ne parvient pas à
      //    optimiser certaines `useMemo` existantes ("Compilation Skipped").
      //    Informatif — la mémoïsation manuelle reste correcte.
      // Conservées en "warn" pour rester visibles ; refactor incrémental (Kaizen).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;