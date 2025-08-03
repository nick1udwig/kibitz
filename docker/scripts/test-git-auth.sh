#!/bin/bash

# ============================================================================
# Test Script for Docker Git Authentication
# Tests Git credential setup and GitHub authentication
# ============================================================================

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# Test functions
test_environment_variables() {
    log_info "Testing environment variables..."
    
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        log_success "GITHUB_TOKEN is set"
    elif [[ -n "${GH_TOKEN:-}" ]]; then
        log_success "GH_TOKEN is set"
    else
        log_error "No GitHub token found (GITHUB_TOKEN or GH_TOKEN)"
        return 1
    fi
    
    if [[ -n "${GITHUB_USERNAME:-}" ]]; then
        log_success "GITHUB_USERNAME is set"
    else
        log_warning "GITHUB_USERNAME not set (optional)"
    fi
}

test_git_configuration() {
    log_info "Testing Git configuration..."
    
    # Check if Git is installed
    if command -v git >/dev/null 2>&1; then
        log_success "Git is installed"
    else
        log_error "Git is not installed"
        return 1
    fi
    
    # Check credential helper configuration
    local credential_helper
    credential_helper=$(git config --global credential.helper 2>/dev/null || echo "")
    
    if [[ "$credential_helper" == "/app/scripts/git-credential-helper.sh" ]]; then
        log_success "Git credential helper is configured correctly"
    else
        log_error "Git credential helper not configured (expected: /app/scripts/git-credential-helper.sh, got: $credential_helper)"
    fi
    
    # Check user configuration
    local git_user_name
    git_user_name=$(git config --global user.name 2>/dev/null || echo "")
    
    if [[ -n "$git_user_name" ]]; then
        log_success "Git user.name is configured: $git_user_name"
    else
        log_error "Git user.name is not configured"
    fi
    
    local git_user_email
    git_user_email=$(git config --global user.email 2>/dev/null || echo "")
    
    if [[ -n "$git_user_email" ]]; then
        log_success "Git user.email is configured: $git_user_email"
    else
        log_error "Git user.email is not configured"
    fi
}

test_credential_helper_script() {
    log_info "Testing credential helper script..."
    
    local script_path="/app/scripts/git-credential-helper.sh"
    
    if [[ -f "$script_path" ]]; then
        log_success "Credential helper script exists"
    else
        log_error "Credential helper script not found at $script_path"
        return 1
    fi
    
    if [[ -x "$script_path" ]]; then
        log_success "Credential helper script is executable"
    else
        log_error "Credential helper script is not executable"
        return 1
    fi
    
    # Test the credential helper directly
    log_info "Testing credential helper functionality..."
    
    if [[ -n "${GITHUB_TOKEN:-}" || -n "${GH_TOKEN:-}" ]]; then
        # Create a test input for the credential helper
        local test_input="protocol=https
host=github.com
username=git

"
        
        # Test the credential helper
        local helper_output
        if helper_output=$(echo -e "$test_input" | "$script_path" get 2>/dev/null); then
            if echo "$helper_output" | grep -q "password=" && echo "$helper_output" | grep -q "username=git"; then
                log_success "Credential helper provides credentials correctly"
            else
                log_error "Credential helper output format incorrect"
            fi
        else
            log_error "Credential helper failed to execute"
        fi
    else
        log_warning "Cannot test credential helper without GitHub token"
    fi
}

test_github_connectivity() {
    log_info "Testing GitHub connectivity..."
    
    # Test basic network connectivity to GitHub
    if curl -s --max-time 10 https://github.com >/dev/null 2>&1; then
        log_success "Can reach GitHub"
    else
        log_error "Cannot reach GitHub"
        return 1
    fi
    
    # Test Git operations with GitHub
    log_info "Testing Git authentication with GitHub..."
    
    # Create a temporary directory for testing
    local temp_dir
    temp_dir=$(mktemp -d)
    cd "$temp_dir"
    
    # Test git ls-remote (doesn't require repository access)
    if git ls-remote https://github.com/octocat/Hello-World.git >/dev/null 2>&1; then
        log_success "Git can authenticate with GitHub (ls-remote test)"
    else
        log_error "Git authentication with GitHub failed"
    fi
    
    # Cleanup
    cd /
    rm -rf "$temp_dir"
}

test_kibitz_git_integration() {
    log_info "Testing Kibitz Git integration..."
    
    # Check if project workspace exists
    local workspace_path="${PROJECT_WORKSPACE_PATH:-/Users/test/gitrepo/projects}"
    
    if [[ -d "$workspace_path" ]]; then
        log_success "Project workspace directory exists: $workspace_path"
    else
        log_warning "Project workspace directory not found: $workspace_path"
    fi
    
    # Check if we can initialize a Git repository in the workspace
    local test_project_dir="$workspace_path/git-auth-test-$(date +%s)"
    
    if mkdir -p "$test_project_dir" 2>/dev/null; then
        cd "$test_project_dir"
        
        if git init >/dev/null 2>&1; then
            log_success "Can initialize Git repository in workspace"
            
            # Test basic Git operations
            echo "Test file" > test.txt
            
            if git add test.txt && git commit -m "Test commit" >/dev/null 2>&1; then
                log_success "Can perform basic Git operations"
            else
                log_error "Cannot perform basic Git operations"
            fi
        else
            log_error "Cannot initialize Git repository in workspace"
        fi
        
        # Cleanup test directory
        cd /
        rm -rf "$test_project_dir"
    else
        log_warning "Cannot create test directory in workspace"
    fi
}

# Main test execution
main() {
    echo "============================================================================"
    echo "Docker Git Authentication Test Suite"
    echo "============================================================================"
    echo ""
    
    test_environment_variables
    echo ""
    
    test_git_configuration
    echo ""
    
    test_credential_helper_script
    echo ""
    
    test_github_connectivity
    echo ""
    
    test_kibitz_git_integration
    echo ""
    
    # Summary
    echo "============================================================================"
    echo "Test Results Summary"
    echo "============================================================================"
    echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed! Git authentication is working correctly.${NC}"
        echo ""
        echo "You can now use Git operations in your Kibitz application:"
        echo "- Auto-commit and branch management"
        echo "- GitHub repository creation"
        echo "- Push/pull operations"
        echo "- GitHub sync functionality"
        echo ""
        exit 0
    else
        echo -e "${RED}❌ Some tests failed. Please check the configuration.${NC}"
        echo ""
        echo "Common fixes:"
        echo "1. Set GITHUB_TOKEN environment variable"
        echo "2. Verify token permissions (repo scope required)"
        echo "3. Check internet connectivity"
        echo "4. Rebuild Docker container if configuration changed"
        echo ""
        exit 1
    fi
}

# Execute main function
main "$@"