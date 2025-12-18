# nojo-doc: hooks

Path: @/src/cli/features/claude-code/hooks

### Overview

Feature loader that configures Claude Code hooks by writing hook configurations directly into ~/.claude/settings.json. Manages multiple types of hooks: desktop notifications with click-to-focus support, nested installation warnings, context usage warnings (alerts when accumulated permissions consume excessive tokens), and slash command interception via UserPromptSubmit (registry-based system in intercepted-slashcommands/).

### How it fits into the larger codebase

This feature loader (loader.ts) is registered with @/src/cli/features/claude-code/loaderRegistry.ts and executed by @/src/cli/commands/install/install.ts during installation. Unlike other feature loaders that copy files, the hooks loader writes hook configurations into ~/.claude/settings.json using Claude Code's native hooks system. Hook scripts from @/src/cli/features/claude-code/hooks/config are referenced via absolute paths in the settings.json configuration.

### Core Implementation

The loader.ts defines HookInterface objects (nestedInstallWarningHook, contextUsageWarningHook, notifyHook, slashCommandInterceptHook), each providing an install() function that returns hook configurations. The loader reads existing settings.json, merges the hooks configuration into the settings object, and writes it back. The removeHooks() function removes the hooks configuration during uninstall. The validate() function ensures all expected hooks are present and properly configured. Each hook points to a compiled JavaScript file in @/src/cli/features/claude-code/hooks/config using Node.js to execute them.

### Things to Know

Installed hooks include: nested-install-warning (SessionStart), context-usage-warning (SessionStart), desktop notifications (Notification), and slash-command-intercept (UserPromptSubmit). The settings.json structure uses event matchers ('startup' for session start, '' empty for UserPromptSubmit) to control when hooks fire. All hooks gracefully handle errors and exit with code 0 to avoid disrupting Claude Code sessions.

The nestedInstallWarningHook runs on SessionStart with the 'startup' matcher and checks for nojo installations in ancestor directories using findAncestorInstallations() from @/src/utils/path.ts. If ancestor installations are detected, it outputs a systemMessage warning the user about potential duplicate or conflicting configurations.

The slashCommandInterceptHook intercepts slash commands at the UserPromptSubmit event to enable instant execution without LLM inference. This bypasses the slash command expansion that would otherwise require multiple LLM calls. The hook uses a registry pattern (see @/src/cli/features/claude-code/hooks/config/intercepted-slashcommands/) where each command implements the InterceptedSlashCommand interface with matchers (regex patterns) and a run function. Currently registered commands: `/nojo/install-location` (shows installation directory), `/nojo/switch-profile` (instant profile switching), `/nojo/toggle-autoupdate` (toggle autoupdate setting), `/nojo/toggle-session-transcripts` (toggle transcript saving). All commands use getInstallDirs() to locate the nojo installation from cwd upward.

The notifyHook (notify-hook.sh) logs to the consolidated log file at `/tmp/nojo.log`. This replaces the previous per-installation log file for easier debugging.

Desktop notifications support click-to-focus functionality on Linux X11 and macOS when optional dependencies are installed. See @/src/cli/features/claude-code/hooks/config/docs.md for installation instructions for optional dependencies.

Historical note: This loader previously configured additional hooks for session summarization (summarize.ts, summarize-notification.ts), statistics display (statistics.ts, statistics-notification.ts), autoupdate (autoupdate.ts), and commit attribution (commit-author.ts). These were removed when paid features were removed from the codebase. The current hooks are: nestedInstallWarningHook, contextUsageWarningHook, notifyHook, and slashCommandInterceptHook.
