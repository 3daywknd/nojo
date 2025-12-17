---
description: Display information about nojo features and capabilities
---

Please read the following information about nojo and provide a clear, concise summary to me. After your summary, state: "I loaded the nojo documentation. You can ask me for more help about how to use nojo if you would like."

Suggest helpful follow-up questions like:

- "How do I switch between profiles?"
- "What skills are available and when should I use them?"
- "What's the difference between skills and subagents?"
- "How do I create a custom profile?"

---

# nojo Documentation

nojo enhances Claude Code with better context management and specialized workflows for solo developers.

## 1. Profile System

Profiles control Claude's behavior and autonomy level. Built-in profiles are available:

### 1.1 senior-swe (Default)

- **Behavior:** Co-pilot mode with high confirmation
- **Worktrees:** Asks user to create branch/worktree
- **Commits/PRs:** Always asks before committing or creating PRs
- **Best for:** Engineers who want control over git operations

### 1.2 amol

- **Behavior:** Full autonomy with frequent commits
- **Worktrees:** Automatically creates worktrees
- **Commits/PRs:** Autonomous commits and PR creation
- **Best for:** Experienced users who want maximum productivity

### 1.3 product-manager

- **Behavior:** Full autonomy optimized for product managers
- **Best for:** Product managers and users focused on product requirements

### 1.4 documenter

- **Behavior:** Documentation-focused workflows
- **Best for:** Users focused on generating and maintaining documentation

### 1.5 Profile Management

- **Switch profiles:** `/nojo/switch-profile` or `nojo switch-profile`
- **Custom profiles:** Create your own in `~/.claude/profiles/`
- **Source of truth:** All profiles stored in `~/.claude/profiles/`

## 2. Skills System

Skills are reusable workflows that guide Claude through complex tasks. Claude automatically references these from `{{skills_dir}}/`.

### 2.1 Available Skills

**Core:**

- **using-skills** - How to use skills (mandatory reading)
- **creating-skills** - How to create new skills

**Collaboration:**

- **brainstorming** - Refine ideas through Socratic questioning
- **finishing-a-development-branch** - Final checks before PRs
- **receiving-code-review** - Handle code review feedback with rigor
- **writing-plans** - Create comprehensive implementation plans
- **updating-nojodocs** - Update documentation after code changes

**Testing & Debugging:**

- **test-driven-development** - RED-GREEN-REFACTOR TDD cycle
- **testing-anti-patterns** - What NOT to do when writing tests
- **systematic-debugging** - Four-phase debugging framework
- **root-cause-tracing** - Backward tracing technique
- **creating-debug-tests-and-iterating** - Create targeted tests for bugs

**Tools:**

- **using-git-worktrees** - Create isolated workspaces
- **using-screenshots** - Capture screen context
- **webapp-testing** - Playwright-based web testing
- **building-ui-ux** - UI/UX implementation patterns
- **handle-large-tasks** - Break down complex tasks

## 3. Specialized Subagents

Subagents are autonomous agents that handle complex, multi-step tasks.

### 3.1 Available Subagents

- **nojo-web-search-researcher** - Research modern information from the web
- **nojo-codebase-analyzer** - Analyze specific components in detail
- **nojo-codebase-locator** - Find files and components relevant to a task
- **nojo-codebase-pattern-finder** - Find usage examples and patterns to model after
- **nojo-initial-documenter** - Generate docs.md files for your codebase
- **nojo-change-documenter** - Auto-document code changes
- **nojo-code-reviewer** - Review code for issues

## 4. Hooks System

Hooks execute automatically in response to events like session start/end.

### 4.1 Available Hooks

- **Desktop notifications** (Notification) - Alerts when Claude needs attention
- **Nested install warning** (SessionStart) - Warn about conflicting installations
- **Context usage warning** (SessionStart) - Warn about excessive permissions consuming context

## 5. Noridocs Documentation System

An opinionated documentation system with docs.md files in each folder.

### 5.1 Features

- **Format:** Overview, How it fits, Core Implementation, Things to Know
- **Updates:** Manual via updating-nojodocs skill
- **Storage:** Part of codebase, tracked in git
- **Initialize:** `/nojo/init-docs` to generate throughout codebase

## 6. Status Line

Real-time display of conversation metrics in your Claude Code interface.

### 6.1 Displayed Metrics

- Git branch
- Active profile name (color-coded in yellow)
- Token usage and conversation costs
- Lines changed

### 6.2 Rotating Tips

- 30 tips cycling hourly
- Best practices and feature reminders

## 7. CLAUDE.md Behavioral Instructions

Profile-specific instructions that guide Claude's behavior.

### 7.1 Features

- **Managed block pattern** - Safe updates without destroying user content
- **Dynamic skills list** - Auto-generated from installed skills
- **Profile-specific workflows** - Tone, autonomy, git behavior
- **Location:** `~/.claude/CLAUDE.md`

## 8. Slash Commands

Custom commands available in Claude Code.

- `/nojo/info` - Display this information (you're using it now!)
- `/nojo/debug` - Validate nojo installation (`nojo check`)
- `/nojo/install-location` - Display nojo installation directories
- `/nojo/switch-profile` - Switch between profiles interactively
- `/nojo/create-profile` - Create a custom profile
- `/nojo/prune-context` - Clear accumulated permissions to reduce context
- `/nojo/init-docs` - Generate documentation files throughout codebase

## 9. Installation & Upgrade

### 9.1 Install

```bash
npm install -g nojo
nojo install
```

### 9.2 Switch Profiles

```bash
nojo switch-profile
```

Or use the `/nojo/switch-profile` slash command.

## 10. Troubleshooting

If you encounter installation issues, check the log file:

```bash
cat $TMPDIR/nojo.log
```

For validation and debugging:

```bash
nojo check
```

Or use the `/nojo/debug` slash command.
