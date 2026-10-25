import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  ...nextVitals,
  {
    // Existing lock/filter effects are retained, not redesigned for hosting.
    files: ["src/components/drinkcard.tsx", "src/contexts/Global/index.tsx"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
];
