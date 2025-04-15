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
 -e MIRROR_ISSUES="false" \
 -e MIRROR_STARRED="false" \
 -e MIRROR_ORGANIZATIONS="true" \
 -e ONLY_MIRROR_ORGS="true" \
 -e USE_SPECIFIC_USER="$USE_SPECIFIC_USER" \
 -e INCLUDE_ORGS="$INCLUDE_ORGS" \
 -e EXCLUDE_ORGS="$EXCLUDE_ORGS" \
 -e PRESERVE_ORG_STRUCTURE="true" \
 -e GITEA_STARRED_ORGANIZATION="$GITEA_STARRED_ORGANIZATION" \
 -e SKIP_STARRED_ISSUES="$SKIP_STARRED_ISSUES" \
 -e DRY_RUN="false" \
 jaedle/mirror-to-gitea:development
