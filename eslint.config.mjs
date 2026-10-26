import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Evita que vuelvan a colarse console.log de depuración (visibles en la
    // consola del navegador). Los errores reales siguen permitidos con
    // console.warn/console.error; los logs de servidor van por '@/lib/logger'.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/logger.ts"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
];

export default eslintConfig;
