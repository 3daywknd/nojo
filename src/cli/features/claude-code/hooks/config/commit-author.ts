/**
 * Commit-author PreToolUse hook
 * Intercepts git commit commands and removes Claude Code attribution
 */

// Type for the stdin JSON from Claude Code
export type HookInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: {
    command?: string;
    [key: string]: any;
  };
  tool_use_id: string;
};

// Type for hook output
export type HookOutput = {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    updatedInput?: {
      command?: string;
      [key: string]: any;
    };
  };
};

/**
 * Check if a command is a git commit command
 * @param args - Arguments object
 * @param args.command - The bash command to check
 *
 * @returns True if the command is a git commit command with -m flag
 */
export const isGitCommitCommand = (args: { command: string }): boolean => {
  const { command } = args;
  // Match git commit with optional flags before "commit" (e.g., git -C /path commit)
  return /git\s+(?:.*\s+)?commit.*(-m|--message)/.test(command);
};

/**
 * Remove Claude Code attribution from commit message
 * @param args - Arguments object
 * @param args.command - The original git commit command
 *
 * @returns Modified command with Claude attribution removed
 */
export const replaceAttribution = (args: { command: string }): string => {
  const { command } = args;

  // Pattern to match Claude attribution in heredoc format
  const claudeAttributionPattern =
    /\n*Co-Authored-By:\s*Claude\s*<noreply@anthropic\.com>\n*/gi;

  // Pattern to match Claude Code URL
  const claudeCodeUrlPattern =
    /\n*🤖\s*Generated\s*with\s*\[Claude Code\]\(https:\/\/claude\.com\/claude-code\)\n*/gi;

  // Remove Claude attribution patterns
  let modifiedCommand = command.replace(claudeAttributionPattern, "");
  modifiedCommand = modifiedCommand.replace(claudeCodeUrlPattern, "");

  return modifiedCommand;
};

/**
 * Process hook input and return output
 * Exported for testing
 * @param args - Arguments object
 * @param args.input - The hook input to process
 *
 * @returns Hook output or null if the input should be passed through
 */
export const processInput = (args: { input: HookInput }): HookOutput | null => {
  const { input } = args;
  const { tool_name, tool_input } = input;

  // Only process Bash tool calls
  if (tool_name !== "Bash") {
    return null;
  }

  const command = tool_input.command;

  if (!command) {
    // No command - pass through
    return null;
  }

  // Check if this is a git commit command
  if (!isGitCommitCommand({ command })) {
    // Not a git commit - pass through
    return null;
  }

  // Replace attribution
  const modifiedCommand = replaceAttribution({ command });

  // Return modified command
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason:
        "Automatically removing Claude Code attribution from commit message",
      updatedInput: {
        ...tool_input,
        command: modifiedCommand,
      },
    },
  };
};

/**
 * Main hook function - entry point for CLI execution
 */
const main = async (): Promise<void> => {
  // Read stdin
  const chunks: Array<Buffer> = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const inputStr = Buffer.concat(chunks).toString("utf-8");

  // Parse input JSON
  let input: HookInput;
  try {
    if (!inputStr.trim()) {
      // Empty stdin - pass through
      process.exit(0);
    }
    input = JSON.parse(inputStr);
  } catch {
    // Invalid JSON - pass through
    process.exit(0);
  }

  // Process the input using the exported function
  const output = processInput({ input });

  // If null, pass through (exit silently)
  if (output == null) {
    process.exit(0);
  }

  console.log(JSON.stringify(output));
  process.exit(0);
};

main().catch(() => {
  // Unexpected error - pass through silently
  process.exit(0);
});
