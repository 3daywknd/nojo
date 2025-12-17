#!/usr/bin/env node

/**
 * nojo CLI Router
 *
 * Routes commands to the appropriate installer/uninstaller using commander.js.
 */

import { Command } from "commander";

import { registerCheckCommand } from "@/cli/commands/check/check.js";
import { registerInstallCommand } from "@/cli/commands/install/install.js";
import { registerInstallLocationCommand } from "@/cli/commands/install-location/installLocation.js";
import { registerSwitchProfileCommand } from "@/cli/commands/switch-profile/profiles.js";
import { registerUninstallCommand } from "@/cli/commands/uninstall/uninstall.js";
import { getCurrentPackageVersion } from "@/cli/version.js";
import { normalizeInstallDir } from "@/utils/path.js";

const program = new Command();
const version = getCurrentPackageVersion() || "unknown";

program
  .name("nojo")
  .version(version)
  .description(`nojo - Claude Code Profile Manager v${version}`)
  .option(
    "-d, --install-dir <path>",
    "Custom installation directory (default: ~/.claude)",
    (value) => normalizeInstallDir({ installDir: value }),
  )
  .option("-n, --non-interactive", "Run without interactive prompts")
  .option("-s, --silent", "Suppress all output (implies --non-interactive)")
  .option(
    "-a, --agent <name>",
    "AI agent to use (auto-detected from config, or claude-code)",
  )
  .addHelpText(
    "after",
    `
Examples:
  $ nojo install --install-dir ~/my-dir
  $ nojo uninstall
  $ nojo check
  $ nojo install-location
  $ nojo switch-profile senior-swe
  $ nojo --non-interactive install
  $ nojo --silent install
`,
  );

// Register all commands
registerInstallCommand({ program });
registerUninstallCommand({ program });
registerCheckCommand({ program });
registerSwitchProfileCommand({ program });
registerInstallLocationCommand({ program });

program.parse(process.argv);

// Show help if no command provided
if (process.argv.length < 3) {
  program.help();
}
