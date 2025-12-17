/**
 * First install prompt for existing Claude Code configurations
 * Provides options for how to handle pre-existing .claude directory
 */

import {
  info,
  newline,
  warn,
  brightCyan,
  boldWhite,
  gray,
  raw,
} from "@/cli/logger.js";
import { promptUser } from "@/cli/prompt.js";

/**
 * Strategy for handling existing Claude Code configuration
 */
export type FirstInstallStrategy =
  | "preserve" // Only add nojo infrastructure, preserve existing files
  | "create-profile" // Create a custom profile from existing setup
  | "overwrite"; // Overwrite existing files with nojo defaults

/**
 * Display the first install prompt and get user's strategy choice
 *
 * @param args - Prompt arguments
 * @param args.existingFiles - List of existing files in .claude directory
 *
 * @returns The selected strategy, or null if user cancels
 */
export const promptFirstInstallStrategy = async (args: {
  existingFiles: Array<string>;
}): Promise<FirstInstallStrategy | null> => {
  const { existingFiles } = args;

  // Categorize existing files
  const hasSkills = existingFiles.some((f) => f.startsWith("skills/"));
  const hasCommands = existingFiles.some((f) => f.startsWith("commands/"));
  const hasAgents = existingFiles.some((f) => f.startsWith("agents/"));
  const hasClaudeMd = existingFiles.includes("CLAUDE.md");
  const hasSettings = existingFiles.includes("settings.json");

  // Build description of what exists
  const existingParts: Array<string> = [];
  if (hasSkills) existingParts.push("skills");
  if (hasCommands) existingParts.push("commands");
  if (hasAgents) existingParts.push("agents");
  if (hasClaudeMd) existingParts.push("CLAUDE.md");
  if (hasSettings) existingParts.push("settings");

  // Display warning
  newline();
  warn({ message: "Existing Claude Code configuration detected!" });
  newline();

  if (existingParts.length > 0) {
    info({ message: `Found: ${existingParts.join(", ")}` });
  } else {
    info({ message: `Found ${existingFiles.length} file(s) in .claude/` });
  }
  newline();

  // Display options
  const options = [
    {
      key: "1",
      name: "Preserve existing",
      description:
        "Keep your current configuration. nojo will only add new files and won't overwrite anything.",
    },
    {
      key: "2",
      name: "Create custom profile",
      description:
        "Save your current setup as a new profile, then install nojo defaults.",
    },
    {
      key: "3",
      name: "Overwrite",
      description:
        "Replace existing configuration with nojo defaults. Your files will be backed up.",
    },
  ];

  info({ message: "How would you like to proceed?" });
  newline();

  for (const opt of options) {
    const number = brightCyan({ text: `${opt.key}.` });
    const name = boldWhite({ text: opt.name });
    const desc = gray({ text: opt.description });

    raw({ message: `${number} ${name}` });
    raw({ message: `   ${desc}` });
    newline();
  }

  // Loop until valid selection
  while (true) {
    const response = await promptUser({
      prompt: "Select an option (1-3) or 'q' to cancel: ",
    });

    if (response.toLowerCase() === "q") {
      return null;
    }

    switch (response) {
      case "1":
        info({ message: "Preserving existing configuration..." });
        return "preserve";
      case "2":
        info({ message: "Creating custom profile from existing setup..." });
        return "create-profile";
      case "3":
        info({ message: "Will overwrite with nojo defaults..." });
        return "overwrite";
      default:
        warn({
          message: `Invalid selection "${response}". Please enter 1, 2, 3, or q.`,
        });
        newline();
    }
  }
};

/**
 * Prompt for custom profile name when creating from existing
 *
 * @returns The profile name, or null if user cancels
 */
export const promptCustomProfileName = async (): Promise<string | null> => {
  newline();
  info({ message: "Enter a name for your custom profile." });
  info({ message: "This will be used to switch back to your configuration." });
  newline();

  while (true) {
    const response = await promptUser({
      prompt: "Profile name (or 'q' to cancel): ",
    });

    if (response.toLowerCase() === "q") {
      return null;
    }

    // Validate profile name
    const trimmed = response.trim();
    if (trimmed.length === 0) {
      warn({ message: "Profile name cannot be empty." });
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(trimmed)) {
      warn({
        message:
          "Profile name can only contain lowercase letters, numbers, and hyphens.",
      });
      continue;
    }

    // Reserved names
    const reserved = [
      "senior-swe",
      "amol",
      "product-manager",
      "documenter",
      "none",
    ];
    if (reserved.includes(trimmed)) {
      warn({
        message: `"${trimmed}" is a built-in profile name. Please choose a different name.`,
      });
      continue;
    }

    return trimmed;
  }
};
