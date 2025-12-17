# nojo - Solo Profiles Manager

All changes must be compatible on MacOS, Linux, and Windows (Git Bash). Be careful of using bash
tools that may behave differently on different systems.

## Claude Code configuration vs. nojo Plugin package

**IMPORTANT:** When discussing "Claude" or "Claude Code configuration":

- **Almost always** means modifying files in `src/cli/features/claude-code/` (the nojo Plugin package)
- **Rarely** means modifying `~/.claude/` (the installed user configuration)

**Default assumption:** Unless explicitly stated otherwise, "modify Claude configuration", "update skills", "change hooks", etc. refers to modifying the Plugin package source files at `src/cli/features/claude-code/`, NOT the installed configuration at `~/.claude/`.

**Examples:**

- "Update the writing-plans skill" → Modify `src/cli/features/claude-code/profiles/config/_mixins/_swe/skills/writing-plans/SKILL.md`
- "Change the status line" → Modify `src/cli/features/claude-code/statusline/`
- "Add a new global slash command" → Modify `src/cli/features/claude-code/slashcommands/config/nojo/`

**Only modify `~/.claude/` when:**

- User explicitly says "my installed configuration" or "~/.claude/"
- Testing changes locally before committing to the package

# Skills documentation

Skills in src/cli/features/claude-code/profiles/config/ are self-explanatory. Do not create docs.md files in skill directories unless the skill is particularly complex and requires additional context files.

# Style guide

## Functions and named parameters

All functions except class functions should be arrow functions. All of them
should use named args, even if there is a single parameter. Follow this
pattern throughout:

```ts
const foo = (args: { bar: string; baz: number }) => {
  const { bar, baz } = args;
};
```

To set defaults, use the 'withDefaults' helper found in src/utils/defaults.ts:

```ts
import { withDefaults } from '@/utils/defaults';

const foo = (args: { bar?: string; baz?: number }) => {
  const { bar, baz } = withDefaults(args, { bar: 'hello', baz: 10 });
};
```

## @ Imports

Always import files from the package root. For example, instead of `../foo/bar`
import using `@/foo/bar`.

## Singleton classes

Private constructors are fine, but do not have empty private constructors.
Empty constructors should just be deleted.

## Null vs optional types and parameters

All optional types should also be able to be set to null. Never do:

```
const foo = (args: { bar?: string }) => {}
```

Always do:

```
const foo = (args: { bar?: string | null }) => {}
```

## Null checks

Always use `if (foo == null)` instead of `if (foo === undefined)` or `if (!foo)`.

## try catch error handling

Only use try/catch on system boundaries. Allow failures to bubble up in
intermediate calls. Do not have try catch handlers for every function, as this
masks the stack trace where the try catch originates.

## Run `npm run format` and `npm run lint`

After ANY changes to the codebase, ALWAYS run `npm run format` and `npm run lint` to catch and fix lint errors.

<system-reminder>ALWAYS fix failing tests, even if they aren't caused by you</system-reminder>
