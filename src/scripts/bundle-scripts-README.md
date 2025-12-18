# Hook Scripts Bundler

This script bundles hook scripts into standalone executables using esbuild.

## Why Bundling is Necessary

Hook scripts are TypeScript files that use:

- Path aliases (`@/cli/config.js`, `@/cli/features/...`)
- External dependencies
- Internal modules from the plugin package

After TypeScript compilation, `tsc-alias` converts `@` imports to relative paths like `../../../../../api/index.js`. When these scripts are called by Claude Code hooks, those relative paths may not resolve correctly depending on the working directory.

## Solution: esbuild Bundling

This script uses esbuild to create standalone bundles that:

- Inline all dependencies
- Resolve all imports at build time
- Produce single-file executables that work from any location

## ESM/CommonJS Compatibility

### The Problem

When esbuild bundles CommonJS libraries into ESM format, dynamic `require()` calls for Node.js builtins fail at runtime with:

```
Error: Dynamic require of 'util' is not supported
```

This occurs because:
1. Scripts are bundled as ESM (`format: "esm"`)
2. Some dependencies are CommonJS libraries that use dynamic `require()`
3. ESM doesn't have a native `require` function

### The Solution

The bundler injects `createRequire` from Node.js 'module' package via esbuild's `banner` option:

```javascript
banner: {
  js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
},
```

This provides a working `require` function in ESM context.

## Build Process Integration

1. TypeScript compiles `src/` to `build/` (with `@` aliases)
2. `tsc-alias` converts `@` imports to relative paths
3. **THIS SCRIPT** bundles each hook `*.js` into standalone version
4. Claude Code hooks call the bundled scripts

## Hook Scripts Location

Input/Output: `build/src/cli/features/claude-code/hooks/config/*.js`

The bundled version **REPLACES** the tsc output.

## Integration Points

- `package.json:build` - Build pipeline integration
- `src/cli/features/claude-code/hooks/loader.ts` - Hook configuration
