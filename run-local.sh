#!/usr/bin/env bash

set -ex

docker image build -t jaedle/mirror-to-gitea:development .
source .secrets.rc

# Get host IP for Mac to connect to local Gitea instance
HOST_IP=$(ipconfig getifaddr en0)
echo "Using host IP for local Gitea: $HOST_IP"
GITEA_URL_DOCKER=${GITEA_URL/localhost/$HOST_IP}
echo "Gitea URL for Docker: $GITEA_URL_DOCKER"

docker container run \
 -it \
 --rm \
 -e GITHUB_USERNAME="$GITHUB_USERNAME" \
 -e GITEA_URL="$GITEA_URL_DOCKER" \
 -e GITEA_TOKEN="$GITEA_TOKEN" \
 -e GITHUB_TOKEN="$GITHUB_TOKEN" \
 -e MIRROR_PRIVATE_REPOSITORIES="true" \
 -e MIRROR_ISSUES="true" \
 -e MIRROR_STARRED="true" \
 -e MIRROR_ORGANIZATIONS="true" \
 -e INCLUDE_ORGS="$INCLUDE_ORGS" \
 -e EXCLUDE_ORGS="$EXCLUDE_ORGS" \
 -e PRESERVE_ORG_STRUCTURE="$PRESERVE_ORG_STRUCTURE" \
 -e DRY_RUN="true" \
 jaedle/mirror-to-gitea:development
