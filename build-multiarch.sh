#!/bin/bash
# Script to build and push multi-architecture Docker images for mirror-to-gitea

DOCKER_USERNAME="arunavo4"
REPO_NAME="mirror-to-gitea"
TAG="latest"
BUILDER_NAME="multiarch-builder"

# Check if builder exists, else create with docker-container driver
if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  echo "Creating buildx builder '$BUILDER_NAME' with docker-container driver..."
  docker buildx create --name "$BUILDER_NAME" --driver docker-container --use
else
  echo "Using existing buildx builder '$BUILDER_NAME'"
  docker buildx use "$BUILDER_NAME"
fi

# Ensure builder is bootstrapped
docker buildx inspect --bootstrap

echo "Building and pushing multi-architecture images for $DOCKER_USERNAME/$REPO_NAME:$TAG"
docker buildx build --platform linux/amd64,linux/arm64 \
  --tag $DOCKER_USERNAME/$REPO_NAME:$TAG \
  --push \
  .

if [ ! -z "$1" ]; then
  VERSION_TAG="$1"
  echo "Also tagging as $DOCKER_USERNAME/$REPO_NAME:$VERSION_TAG"
  docker buildx build --platform linux/amd64,linux/arm64 \
    --tag $DOCKER_USERNAME/$REPO_NAME:$VERSION_TAG \
    --push \
    .
fi

echo "Multi-architecture images built and pushed successfully!"
echo "Supported architectures:"
echo "- linux/amd64 (Intel/AMD 64-bit)"
echo "- linux/arm64 (ARM 64-bit, e.g., Apple Silicon, newer Raspberry Pi)"

echo ""
echo "Usage:"
echo "docker pull $DOCKER_USERNAME/$REPO_NAME:$TAG"
echo ""
echo "Docker will automatically select the correct image for your architecture."
