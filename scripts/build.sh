#!/bin/bash

# nojo Build Script
#
# This script orchestrates the complete build process.
# It compiles TypeScript, resolves path aliases, bundles scripts, and prepares
# all configuration files for installation.

set -e  # Exit on any error

# Detect Windows (Git Bash/MSYS/Cygwin)
IS_WINDOWS=false
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=true ;;
esac

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  nojo Build${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# ============================================================================
# STEP 1: Clean Build Directory
# ============================================================================
echo -e "${BLUE}[1/6] Cleaning build directory...${NC}"
rm -rf build/
echo -e "${GREEN}✓ Build directory cleaned${NC}"
echo ""

# ============================================================================
# STEP 2: TypeScript Compilation
# ============================================================================
echo -e "${BLUE}[2/6] Compiling TypeScript...${NC}"
npx tsc
echo -e "${GREEN}✓ TypeScript compilation complete${NC}"
echo ""

# ============================================================================
# STEP 3: Path Alias Resolution
# ============================================================================
echo -e "${BLUE}[3/6] Resolving path aliases...${NC}"
npx tsc-alias --verbose

# Verify no @/ imports remain in production JS files (not test files)
UNRESOLVED=$(grep -r "from ['\"]@/" build/src --include="*.js" | grep -v "\.test\.js" | grep -v "vi\.mock" || true)
if [ -n "$UNRESOLVED" ]; then
  echo -e "${RED}ERROR: Unresolved @/ imports found after tsc-alias:${NC}"
  echo "$UNRESOLVED"
  exit 1
fi

echo -e "${GREEN}✓ Path aliases resolved${NC}"
echo ""

# ============================================================================
# STEP 4: Bundle Scripts
# ============================================================================
echo -e "${BLUE}[4/6] Bundling hook scripts...${NC}"
node build/src/scripts/bundle-scripts.js
echo -e "${GREEN}✓ Hook scripts bundled${NC}"
echo ""

# ============================================================================
# STEP 5: Copy Configuration Files
# ============================================================================
echo -e "${BLUE}[5/6] Copying configuration files...${NC}"

# Create required directories
mkdir -p build/src/cli/features/claude-code/hooks/config
mkdir -p build/src/cli/features/claude-code/statusline/config
mkdir -p build/src/cli/features/claude-code/profiles/config
mkdir -p build/src/cli/features/claude-code/slashcommands/config

# Copy configuration files
cp src/cli/features/claude-code/hooks/config/*.sh build/src/cli/features/claude-code/hooks/config/ 2>/dev/null || true
cp src/cli/features/claude-code/statusline/config/*.sh build/src/cli/features/claude-code/statusline/config/ 2>/dev/null || true
cp -r src/cli/features/claude-code/slashcommands/config/* build/src/cli/features/claude-code/slashcommands/config/ 2>/dev/null || true

# Copy entire profile directories
cp -r src/cli/features/claude-code/profiles/config/* build/src/cli/features/claude-code/profiles/config/ 2>/dev/null || true

# Set file permissions (skip on Windows)
if [ "$IS_WINDOWS" = "false" ]; then
    chmod +x build/src/cli/cli.js
    chmod +x build/src/cli/commands/install/install.js
    chmod +x build/src/cli/commands/uninstall/uninstall.js
    chmod +x build/src/cli/features/claude-code/hooks/config/*.sh 2>/dev/null || true
    chmod +x build/src/cli/features/claude-code/statusline/config/*.sh 2>/dev/null || true
fi

echo -e "${GREEN}✓ Configuration files copied${NC}"
echo ""

# ============================================================================
# STEP 6: Version Substitution
# ============================================================================
echo -e "${BLUE}[6/6] Substituting version placeholder...${NC}"
VERSION=$(node -p "require('./package.json').version")
if [ -f "build/src/cli/features/claude-code/statusline/config/nori-statusline.sh" ]; then
    if [ "$(uname)" = "Darwin" ]; then
        sed -i '' "s/__VERSION__/${VERSION}/g" build/src/cli/features/claude-code/statusline/config/nori-statusline.sh
    else
        sed -i "s/__VERSION__/${VERSION}/g" build/src/cli/features/claude-code/statusline/config/nori-statusline.sh
    fi
fi
echo -e "${GREEN}✓ Version substituted: ${VERSION}${NC}"
echo ""

# ============================================================================
# Build Complete
# ============================================================================
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Next steps:"
echo "  npm link     # Link for local development"
echo "  nojo install # Install to test"
