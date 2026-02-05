/* eslint-env node */
const fs = require("fs");
const path = require("path");

const js = require("@eslint/js");
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const ALL_FILES = ["**/*.{js,jsx,ts,tsx,mjs,cjs}"];

function normalizeIgnorePattern(p) {
  const negated = p.startsWith("!");
  const raw = negated ? p.slice(1) : p;
  const needsGlobalPrefix = raw && !raw.includes("/") && !raw.startsWith("**/");
  const normalized = needsGlobalPrefix ? `**/${raw}` : raw;
  return negated ? `!${normalized}` : normalized;
}

function readIgnoreFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map(normalizeIgnorePattern);
}

function readPackageJsonIgnores() {
  const pkgPath = path.join(__dirname, "package.json");
  if (!fs.existsSync(pkgPath)) return { eslintConfig: null, eslintIgnore: [] };

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const eslintConfig = pkg.eslintConfig ?? null;
    const eslintIgnore = Array.isArray(pkg.eslintIgnore)
      ? pkg.eslintIgnore.map(normalizeIgnorePattern)
      : [];
    return { eslintConfig, eslintIgnore };
  } catch {
    return { eslintConfig: null, eslintIgnore: [] };
  }
}

function loadLegacyConfig() {
  const candidates = [
    ".eslintrc.cjs",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc",
  ];

  for (const rel of candidates) {
    const abs = path.join(__dirname, rel);
    if (!fs.existsSync(abs)) continue;

    if (rel.endsWith(".js") || rel.endsWith(".cjs") || rel.endsWith(".json")) {
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        return require(abs);
      } catch {
        // fallthrough
      }
    }

    if (rel === ".eslintrc") {
      try {
        return JSON.parse(fs.readFileSync(abs, "utf8"));
      } catch {
        // fallthrough (yaml etc.)
      }
    }
  }

  const { eslintConfig } = readPackageJsonIgnores();
  return eslintConfig;
}

function ensureFilesGlobs(configArray) {
  return configArray.map((cfg) => {
    const keys = Object.keys(cfg || {});
    const isIgnoreOnly = keys.length === 1 && keys[0] === "ignores";
    if (isIgnoreOnly) return cfg;

    if (cfg && !cfg.files) {
      return { ...cfg, files: ALL_FILES };
    }
    return cfg;
  });
}

const ignoreFromFile = readIgnoreFile(path.join(__dirname, ".eslintignore"));
const { eslintIgnore } = readPackageJsonIgnores();

const legacyConfig = loadLegacyConfig();

const converted = legacyConfig
  ? compat.config(legacyConfig)
  : compat.extends("eslint:recommended");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/.next/**",
      "_expo/**",
      "web-build/**",
      "scripts/**",
      "scripts/tmp/**",
      "supabase/functions/**",
      "*.bundle.js",
      "*.bundle.js.map",
      "head_profile.tsx",
      "**/.*",
      ...ignoreFromFile,
      ...eslintIgnore,
    ],
  },
  ...ensureFilesGlobs(converted),
];
