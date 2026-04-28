#!/usr/bin/env node
/**
 * Environment check for custom admin + Cloudflare R2 setup.
 */

const fs = require("fs");

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const log = {
  error: (msg) => console.log(`${colors.red}x ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}ok ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}! ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}i ${msg}${colors.reset}`),
};

const REQUIRED = [
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
];

const OPTIONAL = ["NEXT_PUBLIC_APP_URL", "R2_ENDPOINT"];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const result = {};

  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) return;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    result[key] = value;
  });

  return result;
}

function main() {
  const file = ".env.local";
  const env = parseEnvFile(file);

  console.log("\n=== XuongArt Custom Admin Environment Check ===\n");

  if (!fs.existsSync(file)) {
    log.error(`${file} not found.`);
    log.info("Run: cp env.example .env.local");
    process.exit(1);
  }

  let hasMissing = false;

  REQUIRED.forEach((key) => {
    if (env[key]) {
      // Refuse the obvious placeholder values — accepting them used to be
      // possible because adminAuth fell back to a hardcoded string, which
      // made session cookies forgeable on misconfigured deploys.
      if (key === "ADMIN_SESSION_SECRET") {
        if (env[key].length < 16) {
          hasMissing = true;
          log.error(`${key} is too short (need 16+ chars; recommend 32+)`);
          return;
        }
        if (env[key] === "please-change-admin-session-secret") {
          hasMissing = true;
          log.error(`${key} is still the placeholder default — generate a random one`);
          return;
        }
      }
      log.success(`${key} is set`);
    } else {
      hasMissing = true;
      log.error(`${key} is missing`);
    }
  });

  OPTIONAL.forEach((key) => {
    if (env[key]) {
      log.success(`${key} is set`);
    } else {
      log.warn(`${key} is optional and currently missing`);
    }
  });

  if (hasMissing) {
    log.error("\nEnvironment check failed.");
    process.exit(1);
  }

  log.success("\nEnvironment check passed. You can run: npm run dev");
}

main();
