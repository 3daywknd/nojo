# nojo-doc: config

Path: @/src/cli/features/claude-code/hooks/config

### Overview

Executable hook scripts for desktop notifications, nested installation warnings, context usage warnings, and instant slash command execution. Contains hook implementations that Claude Code invokes at lifecycle events: nested-install-warning.ts (warns about ancestor installations), context-usage-warning.ts (warns about excessive permissions consuming context tokens), notify-hook.sh (cross-platform desktop notifications), and slash-command-intercept.ts (intercepts slash commands for instant execution via registry pattern in intercepted-slashcommands/).

### How it fits into the larger codebase

This folder contains the actual hook implementations referenced by @/src/cli/features/claude-code/hooks/loader.ts in ~/.claude/settings.json. The hooks are executed by Claude Code at specific lifecycle events. The nested-install-warning.ts hook uses findAncestorInstallations() from @/src/utils/path.ts to detect conflicting nojo installations in parent directories. The context-usage-warning.ts hook uses fs.stat() to check file sizes of settings.local.json files and warn when accumulated permissions consume excessive context tokens. The notify-hook.sh script provides cross-platform desktop notification support, and slash-command-intercept.ts intercepts slash commands at the UserPromptSubmit event for instant execution without LLM inference overhead, delegating to command implementations in the intercepted-slashcommands/ subdirectory.

### Core Implementation

TypeScript files are compiled to JavaScript during build and executed directly via `node {script}.js` commands configured in settings.json.

**nested-install-warning.ts**: SessionStart hook that warns when multiple nojo installations exist in the directory tree (current directory + ancestors). Loads config to get the installation directory, normalizes it using normalizeInstallDir(). If installDir ends with `.claude`, uses the parent directory to avoid skipping the current installation. Then calls getInstallDirs() from @/src/utils/path.ts to detect ALL directories with nojo installations. Only warns when `allInstallations.length >= 2`. When multiple installations are detected, builds a systemMessage warning about Claude Code recursive CLAUDE.md loading behavior and lists ALL installation paths with uninstall commands for each.

**context-usage-warning.ts**: SessionStart hook that warns when accumulated permissions in settings.local.json files consume excessive context tokens. Claude Code stores user-approved permissions in settings.local.json files at both home level (`~/.claude/settings.local.json`) and project level (`.claude/settings.local.json`). The hook uses `fs.stat()` to check file sizes, summing home and project file sizes. Uses a 10KB threshold (~2.5k tokens). When threshold is exceeded, outputs a systemMessage warning with estimated token usage and suggests running `/nojo/prune-context` to clear accumulated permissions.

**notify-hook.sh**: Shell script that reads JSON notification data from stdin. Logs to the consolidated log file at `/tmp/nojo.log`. Platform detection via `uname -s` determines notification method: Linux uses notify-send with click-to-focus actions (X11 only), macOS tries terminal-notifier then osascript, Windows tries BurntToast PowerShell module then Windows Forms then msg.exe.

**slash-command-intercept.ts**: UserPromptSubmit hook that intercepts slash commands for instant execution without LLM inference overhead. Reads stdin JSON containing prompt, cwd, session_id, and other Claude Code context. Iterates through registered commands from `intercepted-slashcommands/registry.ts`, testing each command matchers (regex patterns) against the trimmed prompt.

**intercepted-slashcommands/**: Subdirectory containing the registry pattern for slash command interception. Contains command implementations for nojo-install-location, nojo-prune-context, nojo-switch-profile, nojo-toggle-autoupdate, nojo-toggle-session-transcripts, and registry commands (search, download, upload, update).

### Things to Know

Hook execution is controlled by @/src/cli/features/claude-code/hooks/loader.ts configuration. Installed hooks include: nested-install-warning, context-usage-warning, notify, and slash-command-intercept.

TypeScript hooks use JSON.stringify() to output structured responses to stdout. nested-install-warning.ts and context-usage-warning.ts output `{systemMessage: "..."}` to inject messages into Claude sessions. Error handling is strictly non-fatal - all hooks catch errors and exit with code 0 to prevent disrupting Claude Code sessions.

**Installation Directory Resolution Pattern:** All hooks must use getInstallDirs() from @/src/utils/path.ts to locate the nojo installation directory. This is CRITICAL because Claude Code may execute these scripts from various directories.

**Subprocess pattern for bundled hooks:** Hook scripts in this directory are bundled by esbuild (via @/src/scripts/bundle-scripts.ts) into standalone executables. When bundled, `__dirname` resolves to the bundled script location instead of the original source file locations. The solution is to use subprocess invocation to run CLI commands like `nojo install`.

Historical note: This directory previously contained summarize.ts, summarize-notification.ts, statistics.ts, and statistics-notification.ts hooks for session summarization and statistics display. These were removed when paid features were removed from the codebase.

### Optional Dependencies for Click-to-Focus Notifications

The notify-hook.sh script sends desktop notifications when Claude needs attention.

**Linux (X11)**: Install `libnotify-bin wmctrl xdotool` for clickable notifications.

**macOS**: Install `terminal-notifier` via Homebrew for clickable notifications.

**Windows**: Uses built-in PowerShell commands and does not require additional dependencies.
