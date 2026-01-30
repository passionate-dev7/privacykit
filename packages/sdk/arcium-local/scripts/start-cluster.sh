#!/bin/bash
# Start Arcium Local Cluster
# This script starts the local Arcium MPC cluster for development

set -e

echo "=========================================="
echo "  Starting Arcium Local Cluster"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_DIR/logs"
PID_FILE="$PROJECT_DIR/.cluster.pid"

# Create logs directory
mkdir -p "$LOGS_DIR"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Docker is not running. Please start Docker first."
    exit 1
fi

# Check if a cluster is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}[WARNING]${NC} A cluster is already running (PID: $OLD_PID)"
        echo "Use './scripts/stop-cluster.sh' to stop it first, or './scripts/restart.sh' to restart."
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

echo "1. Starting Solana Localnet Validator..."
echo "-------------------------------------------"

# Check if solana-test-validator is already running
if pgrep -x "solana-test-va" > /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} Solana test validator is already running"
else
    echo -e "${BLUE}[INFO]${NC} Starting Solana test validator in background..."

    # Start solana-test-validator with BPF programs pre-deployed
    nohup solana-test-validator \
        --reset \
        --quiet \
        > "$LOGS_DIR/solana-validator.log" 2>&1 &

    VALIDATOR_PID=$!
    echo $VALIDATOR_PID > "$PROJECT_DIR/.validator.pid"

    # Wait for validator to start
    echo -n "Waiting for validator to start"
    for i in {1..30}; do
        if solana cluster-version &> /dev/null; then
            echo ""
            echo -e "${GREEN}[OK]${NC} Solana test validator started (PID: $VALIDATOR_PID)"
            break
        fi
        echo -n "."
        sleep 1
    done

    if ! solana cluster-version &> /dev/null; then
        echo ""
        echo -e "${RED}[ERROR]${NC} Failed to start Solana test validator"
        exit 1
    fi
fi

# Set Solana CLI to use localnet
solana config set --url localhost &> /dev/null

# Airdrop SOL to the default wallet for testing
echo ""
echo "2. Funding Test Wallet..."
echo "-------------------------------------------"
WALLET_PUBKEY=$(solana address)
echo -e "${BLUE}[INFO]${NC} Wallet: $WALLET_PUBKEY"

# Airdrop 100 SOL
solana airdrop 100 --url localhost &> /dev/null || true
BALANCE=$(solana balance --url localhost 2>/dev/null || echo "0 SOL")
echo -e "${GREEN}[OK]${NC} Wallet balance: $BALANCE"

echo ""
echo "3. Starting Arcium Local MPC Nodes..."
echo "-------------------------------------------"

cd "$PROJECT_DIR"

# Use arcium test to start the local cluster
# The arcium CLI handles starting the MPC nodes automatically
echo -e "${BLUE}[INFO]${NC} Arcium local cluster will start when running 'arcium test'"
echo -e "${BLUE}[INFO]${NC} The cluster is configured with:"

# Read configuration from Arcium.toml
if [ -f "Arcium.toml" ]; then
    NODES=$(grep "nodes" Arcium.toml | head -1 | cut -d'=' -f2 | tr -d ' ')
    BACKENDS=$(grep "backends" Arcium.toml | head -1 | cut -d'=' -f2)
    TIMEOUT=$(grep "localnet_timeout_secs" Arcium.toml | head -1 | cut -d'=' -f2 | tr -d ' ')

    echo "  - Nodes: $NODES"
    echo "  - Backends: $BACKENDS"
    echo "  - Timeout: ${TIMEOUT}s"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Local Cluster Ready!${NC}"
echo "=========================================="
echo ""
echo "The Solana test validator is running and funded."
echo ""
echo "To run MPC computations, use one of these commands:"
echo "  - arcium test              # Run tests with local cluster"
echo "  - arcium build             # Build encrypted instructions"
echo ""
echo "Logs are available at:"
echo "  - Solana Validator: $LOGS_DIR/solana-validator.log"
echo ""
echo "To stop the cluster: ./scripts/stop-cluster.sh"
echo "To check status: ./scripts/status.sh"
echo ""
