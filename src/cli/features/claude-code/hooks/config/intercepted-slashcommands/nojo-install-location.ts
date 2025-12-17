/**
 * Intercepted slash command for showing install location
 * Handles /nojo/install-location command
 */

import { getInstallDirs } from "@/utils/path.js";

import type {
  HookInput,
  HookOutput,
  InterceptedSlashCommand,
} from "./types.js";

import { formatError, formatSuccess } from "./format.js";

/**
 * Run the nojo/install-location command
 * @param args - The function arguments
 * @param args.input - The hook input containing prompt and cwd
 *
 * @returns The hook output with install location info, or null if not matched
 */
const run = async (args: { input: HookInput }): Promise<HookOutput | null> => {
  const { input } = args;
  const { cwd } = input;

  // Find all installation directories
  const allInstallations = getInstallDirs({ currentDir: cwd });

  if (allInstallations.length === 0) {
    return {
      decision: "block",
      reason: formatError({
        message: `No nojo installation found.\n\nRun 'npx nojo install' to install nojo.`,
      }),
    };
  }

  if (allInstallations.length === 1) {
    return {
      decision: "block",
      reason: formatSuccess({
        message: `nojo installation directory:\n\n${allInstallations[0]}`,
      }),
    };
  }

  // Multiple installations found
  const installList = allInstallations
    .map((dir, index) => `${index + 1}. ${dir}`)
    .join("\n");

  return {
    decision: "block",
    reason: formatSuccess({
      message: `nojo installation directories (closest first):\n\n${installList}`,
    }),
  };
};

/**
 * nojo/install-location intercepted slash command
 */
export const nojoInstallLocation: InterceptedSlashCommand = {
  matchers: ["^\\/nojo\\/install-location\\s*$"],
  run,
};
