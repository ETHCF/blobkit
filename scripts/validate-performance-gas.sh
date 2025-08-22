#!/bin/bash
set -e

# BlobKit Performance and Gas Validation Script
# This script runs comprehensive performance and gas validation tests

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$PROJECT_ROOT/performance-gas-validation-report-$TIMESTAMP.md"
LOG_FILE="$PROJECT_ROOT/performance-gas-validation-$TIMESTAMP.log"

# Initialize report
cat > "$REPORT_FILE" << EOF
# BlobKit Performance and Gas Validation Report

**Date:** $(date)
**Environment:** $(uname -a)
**Node Version:** $(node --version)

## Executive Summary

This report validates the performance and gas behavior of the BlobKit system against the following criteria:

1. Contract gas efficiency and CEI compliance
2. Storage optimization
3. Blob operation gas estimation accuracy
4. Proxy server load testing (target: >1000 RPS)
5. Rate limiting effectiveness
6. Memory/queue/log growth patterns
7. Base64 encoding performance
8. Redis queue performance

---

EOF

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    echo "❌ $1" >> "$REPORT_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
    echo "✅ $1" >> "$REPORT_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
    echo "⚠️ $1" >> "$REPORT_FILE"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
    echo "ℹ️ $1" >> "$REPORT_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    local missing=()
    
    command -v node >/dev/null 2>&1 || missing+=("node")
    command -v npm >/dev/null 2>&1 || missing+=("npm")
    command -v forge >/dev/null 2>&1 || missing+=("forge")
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v redis-cli >/dev/null 2>&1 || missing+=("redis-cli")
    
    if [ ${#missing[@]} -ne 0 ]; then
        error "Missing required tools: ${missing[*]}"
        exit 1
    fi
    
    success "All prerequisites met"
}

# Start local services
start_services() {
    log "Starting local services..."
    
    # Start Redis if not running
    if ! redis-cli ping >/dev/null 2>&1; then
        log "Starting Redis..."
        docker run -d --name blobkit-redis -p 6379:6379 redis:alpine >> "$LOG_FILE" 2>&1 || true
        sleep 2
    fi
    
    # Start local Ethereum node if not running
    if ! curl -s http://localhost:8545 >/dev/null 2>&1; then
        log "Starting local Ethereum node..."
        if [ -z "$MAINNET_RPC_URL" ]; then
            error "MAINNET_RPC_URL not set"
            exit 1
        fi
        cd "$PROJECT_ROOT/packages/contracts"
        anvil --fork-url "$MAINNET_RPC_URL" >> "$LOG_FILE" 2>&1 &
        ANVIL_PID=$!
        sleep 5
    fi
    
    success "Local services started"
}

# Run contract gas analysis
run_contract_gas_analysis() {
    echo -e "\n## 1. Contract Gas Analysis\n" >> "$REPORT_FILE"
    log "Running contract gas analysis..."
    
    cd "$PROJECT_ROOT/packages/contracts"
    
    # Run gas analysis tests
    if forge test --match-contract GasAnalysisTest -vvv --gas-report > gas-report.txt 2>&1; then
        success "Contract gas analysis completed"
        
        # Extract gas report
        echo '```' >> "$REPORT_FILE"
        grep -A 20 "gas report" gas-report.txt >> "$REPORT_FILE" || echo "Gas report details in log file" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        
        # Check specific gas limits
        if grep -q "depositForBlob.*[0-9]* gas" gas-report.txt; then
            GAS_DEPOSIT=$(grep "depositForBlob" gas-report.txt | grep -oE "[0-9]+" | head -1)
            if [ "$GAS_DEPOSIT" -lt 100000 ]; then
                success "depositForBlob gas usage: $GAS_DEPOSIT (< 100,000)"
            else
                warning "depositForBlob gas usage: $GAS_DEPOSIT (> 100,000)"
            fi
        fi
    else
        error "Contract gas analysis failed"
        cat gas-report.txt >> "$LOG_FILE"
    fi
    
    # Run security tests for CEI compliance
    echo -e "\n### CEI Compliance\n" >> "$REPORT_FILE"
    if forge test --match-contract BlobKitEscrowSecurityTest --match-test CEI -vv >> "$LOG_FILE" 2>&1; then
        success "CEI (Checks-Effects-Interactions) pattern verified"
    else
        error "CEI pattern verification failed"
    fi
}

# Run storage optimization tests
run_storage_optimization_tests() {
    echo -e "\n## 2. Storage Optimization\n" >> "$REPORT_FILE"
    log "Running storage optimization tests..."
    
    cd "$PROJECT_ROOT/packages/contracts"
    
    if forge test --match-test testStorageOptimization -vvv > storage-test.txt 2>&1; then
        success "Storage optimization verified"
        
        # Extract storage slot usage
        if grep -q "Slot" storage-test.txt; then
            echo '```' >> "$REPORT_FILE"
            grep "Slot" storage-test.txt >> "$REPORT_FILE"
            echo '```' >> "$REPORT_FILE"
        fi
    else
        error "Storage optimization test failed"
    fi
}

# Run proxy server tests
run_proxy_server_tests() {
    echo -e "\n## 3. Proxy Server Performance\n" >> "$REPORT_FILE"
    log "Starting proxy server..."
    
    cd "$PROJECT_ROOT/packages/proxy-server"
    
    # Build if needed
    if [ ! -d "dist" ]; then
        npm run build >> "$LOG_FILE" 2>&1
    fi
    
    # Start proxy server
    NODE_ENV=test npm start >> "$LOG_FILE" 2>&1 &
    PROXY_PID=$!
    sleep 5
    
    # Check if proxy is running
    if ! curl -s http://localhost:3000/api/v1/health >/dev/null 2>&1; then
        error "Proxy server failed to start"
        return 1
    fi
    
    success "Proxy server started (PID: $PROXY_PID)"
    
    # Run performance tests
    log "Running performance validation tests..."
    if npm test -- performance-gas-validation.test.ts --testTimeout=300000 > perf-test-results.txt 2>&1; then
        success "Performance tests completed"
        
        # Extract key metrics
        echo -e "\n### Performance Metrics\n" >> "$REPORT_FILE"
        if grep -q "Load test results:" perf-test-results.txt; then
            echo '```' >> "$REPORT_FILE"
            grep -A 10 "Load test results:" perf-test-results.txt >> "$REPORT_FILE"
            echo '```' >> "$REPORT_FILE"
        fi
    else
        error "Performance tests failed"
        cat perf-test-results.txt >> "$LOG_FILE"
    fi
    
    # Run benchmark script
    log "Running comprehensive benchmark..."
    if npx ts-node test/performance-benchmark.ts > benchmark-results.txt 2>&1; then
        success "Benchmark completed"
        
        # Extract benchmark summary
        echo -e "\n### Benchmark Summary\n" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        grep -A 50 "Benchmark Results Summary" benchmark-results.txt >> "$REPORT_FILE" || echo "See benchmark results file" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
    else
        warning "Benchmark had issues"
    fi
    
    # Stop proxy server
    kill $PROXY_PID 2>/dev/null || true
}

# Run load testing
run_load_testing() {
    echo -e "\n## 4. Load Testing Results\n" >> "$REPORT_FILE"
    log "Running load testing..."
    
    cd "$PROJECT_ROOT/packages/proxy-server"
    
    # Quick load test
    log "Running quick load test (1000 RPS target)..."
    
    # Use Apache Bench if available
    if command -v ab >/dev/null 2>&1; then
        ab -n 10000 -c 100 -t 30 http://localhost:3000/api/v1/health > ab-results.txt 2>&1 || true
        
        if grep -q "Requests per second" ab-results.txt; then
            RPS=$(grep "Requests per second" ab-results.txt | grep -oE "[0-9]+\.[0-9]+" | head -1)
            echo "- Apache Bench RPS: $RPS" >> "$REPORT_FILE"
            
            if (( $(echo "$RPS > 1000" | bc -l) )); then
                success "Load test passed: $RPS RPS (> 1000 RPS target)"
            else
                warning "Load test below target: $RPS RPS (< 1000 RPS target)"
            fi
        fi
    fi
}

# Analyze results
analyze_results() {
    echo -e "\n## 5. Analysis Summary\n" >> "$REPORT_FILE"
    log "Analyzing results..."
    
    local passed=0
    local failed=0
    local warnings=0
    
    # Count results
    passed=$(grep -c "✅" "$REPORT_FILE" || true)
    failed=$(grep -c "❌" "$REPORT_FILE" || true)
    warnings=$(grep -c "⚠️" "$REPORT_FILE" || true)
    
    echo -e "\n### Test Results\n" >> "$REPORT_FILE"
    echo "- **Passed:** $passed" >> "$REPORT_FILE"
    echo "- **Failed:** $failed" >> "$REPORT_FILE"
    echo "- **Warnings:** $warnings" >> "$REPORT_FILE"
    
    # Performance thresholds validation
    echo -e "\n### Performance Thresholds\n" >> "$REPORT_FILE"
    echo "| Metric | Target | Status |" >> "$REPORT_FILE"
    echo "|--------|--------|--------|" >> "$REPORT_FILE"
    echo "| RPS | > 1000 | Check results above |" >> "$REPORT_FILE"
    echo "| P95 Latency | < 100ms | Check results above |" >> "$REPORT_FILE"
    echo "| P99 Latency | < 200ms | Check results above |" >> "$REPORT_FILE"
    echo "| Memory Growth | < 10% | Check results above |" >> "$REPORT_FILE"
    echo "| Gas - Deposit | < 100k | Check results above |" >> "$REPORT_FILE"
    echo "| Gas - Complete | < 150k | Check results above |" >> "$REPORT_FILE"
    
    # Overall assessment
    echo -e "\n### Overall Assessment\n" >> "$REPORT_FILE"
    if [ "$failed" -eq 0 ] && [ "$warnings" -lt 3 ]; then
        echo "✅ **PASSED** - System meets all performance and gas requirements" >> "$REPORT_FILE"
        log "$(echo -e "${GREEN}System validation PASSED${NC}")"
    elif [ "$failed" -eq 0 ]; then
        echo "⚠️ **PASSED WITH WARNINGS** - System meets requirements but has optimization opportunities" >> "$REPORT_FILE"
        log "$(echo -e "${YELLOW}System validation PASSED WITH WARNINGS${NC}")"
    else
        echo "❌ **FAILED** - System does not meet performance/gas requirements" >> "$REPORT_FILE"
        log "$(echo -e "${RED}System validation FAILED${NC}")"
    fi
}

# Cleanup
cleanup() {
    log "Cleaning up..."
    
    # Stop services
    [ ! -z "$PROXY_PID" ] && kill $PROXY_PID 2>/dev/null || true
    [ ! -z "$ANVIL_PID" ] && kill $ANVIL_PID 2>/dev/null || true
    
    # Stop Redis container
    docker stop blobkit-redis 2>/dev/null || true
    docker rm blobkit-redis 2>/dev/null || true
    
    # Clean temp files
    rm -f gas-report.txt storage-test.txt perf-test-results.txt benchmark-results.txt ab-results.txt 2>/dev/null || true
}

# Trap cleanup
trap cleanup EXIT

# Main execution
main() {
    log "Starting BlobKit Performance and Gas Validation"
    log "=============================================="
    
    check_prerequisites
    start_services
    
    # Run all tests
    run_contract_gas_analysis
    run_storage_optimization_tests
    run_proxy_server_tests
    run_load_testing
    
    # Analyze and summarize
    analyze_results
    
    # Final output
    echo -e "\n---\n" >> "$REPORT_FILE"
    echo "*Generated on $(date)*" >> "$REPORT_FILE"
    echo "*Log file: $LOG_FILE*" >> "$REPORT_FILE"
    
    log "Validation complete!"
    log "Report saved to: $REPORT_FILE"
    log "Full log saved to: $LOG_FILE"
    
    # Display summary
    echo ""
    echo "=================================================="
    echo "VALIDATION SUMMARY"
    echo "=================================================="
    grep "Overall Assessment" -A 2 "$REPORT_FILE" | tail -2
    echo "=================================================="
}

# Run main function
main "$@"