import boundaries from "eslint-plugin-boundaries";

export default [
  {
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/*" },
        { type: "feature", pattern: "src/features/*", capture: ["name"] },
        { type: "entity", pattern: "src/entities/*" },
        { type: "shared", pattern: "src/shared/*" },
      ],
    },
    rules: {
      // гравитация слоёв: app → features → entities → shared,
      // назад и вбок — ошибка сборки, а не «договорённость»
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["feature", "entity", "shared"] },
            { from: "feature", allow: ["entity", "shared"] },
            { from: "entity", allow: ["shared"] },
          ],
        },
      ],
      // два запрета, убивающие обходные пути:
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "../*", // относительный выход за границу модуля
            "@/features/*/*", // глубокий импорт мимо index.ts
          ],
        },
      ],
    },
  },
];
