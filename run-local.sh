#!/usr/bin/env sh

set -ex

docker image build -t jaedle/mirror-to-gitea:development .
source .secrets.rc

docker container run \
 -it \
 --rm \
 -e GITHUB_USERNAME="$GITHUB_USERNAME" \
 -e GITEA_URL="$GITEA_URL" \
 -e GITEA_TOKEN="$GITEA_TOKEN" \
 jaedle/mirror-to-gitea:development
