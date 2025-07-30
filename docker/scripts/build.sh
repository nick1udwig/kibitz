#!/bin/bash

# ============================================================================
# Docker Build Script for Kibitz
# ============================================================================

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[BUILD SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[BUILD WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[BUILD ERROR]${NC} $1"
}

# Default values
BUILD_TARGET="production"
NO_CACHE=""
QUIET=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev|--development)
            BUILD_TARGET="development"
            shift
            ;;
        --prod|--production)
            BUILD_TARGET="production"
            shift
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --quiet)
            QUIET="--quiet"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev, --development    Build development image"
            echo "  --prod, --production    Build production image (default)"
            echo "  --no-cache             Build without using cache"
            echo "  --quiet                Suppress build output"
            echo "  --help, -h             Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Navigate to the docker directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DOCKER_DIR")"

cd "$PROJECT_ROOT"

log_info "Building Kibitz Docker image..."
log_info "Target: $BUILD_TARGET"
log_info "Project root: $PROJECT_ROOT"

# Set dockerfile and image tag based on target
if [[ "$BUILD_TARGET" == "development" ]]; then
    DOCKERFILE="docker/Dockerfile.dev"
    IMAGE_TAG="kibitz:dev"
    log_info "Building development image with live reloading..."
else
    DOCKERFILE="docker/Dockerfile"
    IMAGE_TAG="kibitz:latest"
    log_info "Building production image with optimizations..."
fi

# Create necessary directories for volumes
log_info "Creating volume directories..."
mkdir -p docker/volumes/{data,logs}

# Build the Docker image
log_info "Starting Docker build..."

build_start_time=$(date +%s)

if docker build \
    -f "$DOCKERFILE" \
    -t "$IMAGE_TAG" \
    $NO_CACHE \
    $QUIET \
    . ; then
    
    build_end_time=$(date +%s)
    build_duration=$((build_end_time - build_start_time))
    
    log_success "Docker image built successfully!"
    log_success "Image: $IMAGE_TAG"
    log_success "Build time: ${build_duration}s"
    
    # Show image information
    echo ""
    log_info "Image details:"
    docker images "$IMAGE_TAG" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    
    # Provide next steps
    echo ""
    log_info "========================================="
    log_info "  Build Complete! Next Steps:"
    log_info "========================================="
    
    if [[ "$BUILD_TARGET" == "development" ]]; then
        log_info "🚀 Run development environment:"
        log_info "   docker/scripts/run-dev.sh"
        echo ""
        log_info "🔧 Or use docker-compose:"
        log_info "   cd docker/compose && docker-compose -f docker-compose.dev.yml up"
    else
        log_info "🚀 Run production environment:"
        log_info "   docker/scripts/run-prod.sh"
        echo ""
        log_info "🔧 Or use docker-compose:"
        log_info "   cd docker/compose && docker-compose up"
    fi
    
    echo ""
    log_info "📋 Create projects directory:"
    log_info "   mkdir -p user/gitrepo/projects"
    
else
    log_error "Docker build failed!"
    exit 1
fi 