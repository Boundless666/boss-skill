#!/usr/bin/env node

const path = require("path");
const fs = require("fs");

const PKG_ROOT = path.resolve(__dirname, "..");
const pkg = require(path.join(PKG_ROOT, "package.json"));

const USAGE = `
@blade-ai/boss-skill v${pkg.version}
BMAD Harness Engineer — pluggable pipeline skill for coding agents.

Usage:
  boss-skill path          Print the installed skill root directory
  boss-skill install       Copy .claude/ hooks into current project
  boss-skill --version     Print version
  boss-skill --help        Show this help

Examples:
  # Symlink into your project
  ln -s $(boss-skill path)/SKILL.md .claude/SKILL.md

  # Install Claude Code hooks into current project
  boss-skill install
`;

const cmd = process.argv[2];

switch (cmd) {
  case "path":
    process.stdout.write(PKG_ROOT + "\n");
    break;

  case "install": {
    const dest = path.resolve(process.cwd(), ".claude");
    const src = path.join(PKG_ROOT, ".claude", "settings.json");

    if (!fs.existsSync(src)) {
      console.error("Error: .claude/settings.json not found in package.");
      process.exit(1);
    }

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const settings = JSON.parse(fs.readFileSync(src, "utf8"));
    const hookEvents = Object.keys(settings.hooks || {});

    hookEvents.forEach((event) => {
      const hooks = settings.hooks[event];
      if (!Array.isArray(hooks)) return;
      hooks.forEach((hook) => {
        if (hook.command && hook.command.includes("$CLAUDE_PROJECT_DIR")) {
          hook.command = hook.command.replace(
            /"\$CLAUDE_PROJECT_DIR"/g,
            JSON.stringify(PKG_ROOT)
          );
        }
      });
    });

    const destFile = path.join(dest, "settings.json");
    if (fs.existsSync(destFile)) {
      const existing = JSON.parse(fs.readFileSync(destFile, "utf8"));
      existing.hooks = { ...existing.hooks, ...settings.hooks };
      fs.writeFileSync(destFile, JSON.stringify(existing, null, 2) + "\n");
      console.log("Merged hooks into existing .claude/settings.json");
    } else {
      fs.writeFileSync(destFile, JSON.stringify(settings, null, 2) + "\n");
      console.log("Created .claude/settings.json");
    }

    console.log(`Installed ${hookEvents.length} hook events from boss-skill.`);
    break;
  }

  case "--version":
  case "-v":
    console.log(pkg.version);
    break;

  case "--help":
  case "-h":
  case undefined:
    console.log(USAGE);
    break;

  default:
    console.error(`Unknown command: ${cmd}\n`);
    console.log(USAGE);
    process.exit(1);
}
