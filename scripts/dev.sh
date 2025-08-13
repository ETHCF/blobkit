#!/bin/bash
# BlobKit Zero-Setup Developer Experience
# One-click development environment setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ASCII art header
echo -e "${BLUE}"
cat << "EOF"
╔══════════════════════════════════════════════╗
║                                              ║
║    ____  _       _     _  ___ _              ║
║   | __ )| | ___ | |__ | |/ (_) |_            ║
║   |  _ \| |/ _ \| '_ \| ' /| | __|           ║
║   | |_) | | (_) | |_) | . \| | |_            ║
║   |____/|_|\___/|_.__/|_|\_\_|\__|           ║
║                                              ║
║   Zero-Setup Developer Environment v1.0      ║
║                                              ║
╚══════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check system requirements
check_requirements() {
    print_info "Checking system requirements..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install Node.js 18+ from https://nodejs.org"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        print_error "Node.js 18+ required. Current version: $NODE_VERSION"
        exit 1
    fi
    print_success "Node.js $NODE_VERSION ✓"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm not found. Please install npm"
        exit 1
    fi
    print_success "npm $(npm -v) ✓"
    
    # Check Docker (optional)
    if command -v docker &> /dev/null; then
        print_success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') ✓"
    else
        print_warning "Docker not found. Docker is optional but recommended for running services"
    fi
    
    # Check Redis (will start with Docker if not found)
    if command -v redis-cli &> /dev/null; then
        print_success "Redis installed ✓"
    else
        print_warning "Redis not found. Will use Docker to run Redis"
    fi
}

# Setup environment variables
setup_env() {
    print_info "Setting up environment variables..."
    
    if [ ! -f .env ]; then
        cat > .env << EOL
# BlobKit Development Environment
NODE_ENV=development

# Proxy Server Configuration
PORT=3000
HOST=localhost
LOG_LEVEL=debug

# Ethereum Configuration
CHAIN_ID=31337
RPC_URL=http://localhost:8545

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Test Private Key (DO NOT USE IN PRODUCTION)
# Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Escrow Contract (will be deployed locally)
ESCROW_CONTRACT=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Proxy Configuration
PROXY_FEE_PERCENT=10
MAX_BLOB_SIZE=131072
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=900000
JOB_TIMEOUT=3600

# KZG Trusted Setup
KZG_TRUSTED_SETUP_PATH=./trusted_setup.txt

# AWS KMS (optional - for production)
# AWS_KMS_KEY_ID=
# AWS_REGION=us-east-1
EOL
        print_success "Created .env file with development defaults"
    else
        print_info ".env file already exists, skipping"
    fi
}

# Install dependencies
install_deps() {
    print_info "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Build all packages
build_packages() {
    print_info "Building all packages..."
    npm run build
    print_success "All packages built successfully"
}

# Setup local blockchain
setup_blockchain() {
    print_info "Setting up local blockchain..."
    
    # Check if Hardhat node is running
    if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null ; then
        print_info "Local blockchain already running on port 8545"
    else
        print_info "Starting Hardhat node..."
        npx hardhat node > hardhat.log 2>&1 &
        HARDHAT_PID=$!
        sleep 5
        
        if ps -p $HARDHAT_PID > /dev/null; then
            print_success "Hardhat node started (PID: $HARDHAT_PID)"
            echo $HARDHAT_PID > .hardhat.pid
        else
            print_error "Failed to start Hardhat node"
            exit 1
        fi
    fi
}

# Deploy contracts
deploy_contracts() {
    print_info "Deploying smart contracts..."
    
    cd packages/contracts
    npx hardhat run scripts/deploy.js --network localhost || {
        print_warning "Deploy script not found, using forge"
        forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
    }
    cd ../..
    
    print_success "Contracts deployed"
}

# Setup Redis
setup_redis() {
    print_info "Setting up Redis..."
    
    # Check if Redis is running
    if redis-cli ping > /dev/null 2>&1; then
        print_info "Redis already running"
    elif command -v docker &> /dev/null; then
        print_info "Starting Redis with Docker..."
        docker run -d --name blobkit-redis -p 6379:6379 redis:alpine
        sleep 2
        print_success "Redis started in Docker"
    else
        print_error "Redis not running and Docker not available. Please install Redis manually"
        exit 1
    fi
}

# Run tests
run_tests() {
    print_info "Running tests to verify setup..."
    
    # Run contract tests
    print_info "Testing contracts..."
    cd packages/contracts
    npm test || print_warning "Some contract tests failed"
    cd ../..
    
    # Run SDK tests
    print_info "Testing SDK..."
    cd packages/sdk
    npm test || print_warning "Some SDK tests failed"
    cd ../..
    
    # Run proxy tests
    print_info "Testing proxy server..."
    cd packages/proxy-server
    npm test || print_warning "Some proxy tests failed"
    cd ../..
}

# Start development servers
start_dev() {
    print_info "Starting development servers..."
    
    # Create tmux session for all services
    if command -v tmux &> /dev/null; then
        tmux new-session -d -s blobkit
        
        # Window 1: Proxy Server
        tmux rename-window -t blobkit:0 'proxy'
        tmux send-keys -t blobkit:0 'cd packages/proxy-server && npm run dev' C-m
        
        # Window 2: SDK Demo
        tmux new-window -t blobkit:1 -n 'demo'
        tmux send-keys -t blobkit:1 'cd scripts && npm run demo' C-m
        
        # Window 3: Logs
        tmux new-window -t blobkit:2 -n 'logs'
        tmux send-keys -t blobkit:2 'tail -f hardhat.log' C-m
        
        print_success "Development servers started in tmux session 'blobkit'"
        print_info "Attach with: tmux attach -t blobkit"
    else
        # Fallback without tmux
        print_info "Starting proxy server..."
        cd packages/proxy-server
        npm run dev &
        cd ../..
        print_success "Proxy server started on http://localhost:3000"
    fi
}

# Print summary
print_summary() {
    echo
    echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Development Setup Complete           ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
    echo
    print_info "Services Running:"
    echo "  • Hardhat Node: http://localhost:8545"
    echo "  • Redis: redis://localhost:6379"
    echo "  • Proxy Server: http://localhost:3000"
    echo
    print_info "Available Commands:"
    echo "  • npm run dev     - Start all services"
    echo "  • npm test        - Run all tests"
    echo "  • npm run build   - Build all packages"
    echo
    print_info "API Documentation: http://localhost:3000/docs"
    print_info "Health Check: http://localhost:3000/api/v1/health"
    echo
    print_warning "Using test private key. DO NOT use in production!"
}

# Cleanup function
cleanup() {
    print_info "Cleaning up..."
    
    # Stop Hardhat node
    if [ -f .hardhat.pid ]; then
        kill $(cat .hardhat.pid) 2>/dev/null || true
        rm .hardhat.pid
    fi
    
    # Stop Redis container
    docker stop blobkit-redis 2>/dev/null || true
    docker rm blobkit-redis 2>/dev/null || true
    
    print_success "Cleanup complete"
}

# Trap cleanup on exit
trap cleanup EXIT

# Main execution
main() {
    case "${1:-}" in
        clean)
            cleanup
            ;;
        test)
            run_tests
            ;;
        *)
            check_requirements
            setup_env
            install_deps
            build_packages
            setup_blockchain
            setup_redis
            deploy_contracts
            start_dev
            print_summary
            ;;
    esac
}

# Run main function
main "$@"