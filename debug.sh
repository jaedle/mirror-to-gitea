#!/usr/bin/env bash

set -e

echo "Mirror to Gitea Debug Script"
echo "============================="
source .secrets.rc

# Get host machine IP address
HOST_IP=$(ipconfig getifaddr en0)
echo "Host IP: $HOST_IP"
GITEA_URL_HOST=${GITEA_URL/localhost/$HOST_IP}
echo "Gitea URL: $GITEA_URL"
echo "Gitea URL for Docker: $GITEA_URL_HOST"

echo -e "\nTesting Gitea API access directly:"
curl -s -H "Authorization: token $GITEA_TOKEN" "$GITEA_URL/api/v1/user" | jq '.'

echo -e "\nTesting GitHub token validity:"
GITHUB_USER_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user")
echo "$GITHUB_USER_RESPONSE" | jq '. | {login, name}'

echo -e "\nTesting GitHub organization access:"
ORG_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/orgs")
ORG_COUNT=$(echo "$ORG_RESPONSE" | jq '. | length')
if [ "$ORG_COUNT" -eq 0 ]; then
    echo "No organizations found. You may not be a member of any GitHub organizations."
    echo "Organizations response: $ORG_RESPONSE"
else
    echo "$ORG_RESPONSE" | jq '.[].login'
fi

echo -e "\nTesting GitHub starred repos access:"
STARRED_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/starred?per_page=1")
STARRED_COUNT=$(echo "$STARRED_RESPONSE" | jq '. | length')
if [ "$STARRED_COUNT" -eq 0 ]; then
    echo "No starred repositories found. You may not have starred any GitHub repositories."
else
    echo "$STARRED_RESPONSE" | jq '.[].full_name'
fi

echo -e "\nVerifying GitHub token scopes:"
SCOPES=$(curl -s -I -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user" | grep -i "x-oauth-scopes:" | cut -d ":" -f 2- | tr -d '\r')
if [ -z "$SCOPES" ]; then
    echo "No scopes found in GitHub token"
else
    echo "Your token has these scopes: $SCOPES"
fi

echo -e "\nRequired scopes for full functionality:"
echo "- repo (for repositories and issues)"
echo "- read:org (for organization access)"
echo "- user (for starred repositories)"

echo -e "\nYour environment should now be ready for testing."
echo "Run ./run-local.sh to start the mirroring process."