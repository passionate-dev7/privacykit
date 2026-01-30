#!/bin/bash
# Arcium Local Cluster Setup Script
# This script sets up all prerequisites for running a local Arcium cluster

set -e

echo "=========================================="
echo "  Arcium Local Cluster Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a command exists
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}[OK]${NC} $1 is installed: $($1 --version 2>/dev/null | head -n1)"
        return 0
    else
        echo -e "${RED}[MISSING]${NC} $1 is not installed"
        return 1
    fi
}

# Function to check if Docker is running
check_docker_running() {
    if docker info &> /dev/null; then
        echo -e "${GREEN}[OK]${NC} Docker daemon is running"
        return 0
    else
        echo -e "${RED}[ERROR]${NC} Docker daemon is not running. Please start Docker."
        return 1
    fi
}

echo "1. Checking Prerequisites..."
echo "-------------------------------------------"

MISSING_DEPS=0

# Check required tools
check_command "docker" || MISSING_DEPS=1
check_command "solana" || MISSING_DEPS=1
check_command "anchor" || MISSING_DEPS=1
check_command "arcium" || MISSING_DEPS=1
check_command "yarn" || check_command "npm" || MISSING_DEPS=1
check_command "rustc" || MISSING_DEPS=1

echo ""
echo "2. Checking Docker Status..."
echo "-------------------------------------------"
check_docker_running || MISSING_DEPS=1

if [ $MISSING_DEPS -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}Some dependencies are missing. Please install them:${NC}"
    echo ""
    echo "Installation commands:"
    echo "  - Arcium CLI: curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash"
    echo "  - Solana CLI: sh -c \"\$(curl -sSfL https://release.anza.xyz/v2.1.21/install)\""
    echo "  - Anchor: cargo install --git https://github.com/coral-xyz/anchor avm --force"
    echo "  - Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "  - Docker: https://docs.docker.com/get-docker/"
    echo ""
    exit 1
fi

echo ""
echo "3. Checking Solana Keypair..."
echo "-------------------------------------------"

KEYPAIR_PATH="$HOME/.config/solana/id.json"
if [ -f "$KEYPAIR_PATH" ]; then
    echo -e "${GREEN}[OK]${NC} Solana keypair exists at $KEYPAIR_PATH"
else
    echo -e "${YELLOW}[INFO]${NC} Creating new Solana keypair..."
    solana-keygen new --no-bip39-passphrase -o "$KEYPAIR_PATH"
    echo -e "${GREEN}[OK]${NC} Keypair created at $KEYPAIR_PATH"
fi

echo ""
echo "4. Setting Solana CLI to Localnet..."
echo "-------------------------------------------"
solana config set --url localhost
echo -e "${GREEN}[OK]${NC} Solana CLI configured for localnet"

echo ""
echo "5. Installing Node Dependencies..."
echo "-------------------------------------------"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if [ -f "yarn.lock" ] || command -v yarn &> /dev/null; then
    yarn install
else
    npm install
fi
echo -e "${GREEN}[OK]${NC} Node dependencies installed"

echo ""
echo "6. Creating Required Directories..."
echo "-------------------------------------------"
mkdir -p "$PROJECT_DIR/encrypted-ixs"
mkdir -p "$PROJECT_DIR/programs"
mkdir -p "$PROJECT_DIR/tests"
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$PROJECT_DIR/logs"
echo -e "${GREEN}[OK]${NC} Directories created"

echo ""
echo "=========================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Start the local cluster: ./scripts/start-cluster.sh"
echo "  2. Check cluster status: ./scripts/status.sh"
echo "  3. Run tests: yarn test"
echo ""
echo "For more information, see README.md"
echo ""
