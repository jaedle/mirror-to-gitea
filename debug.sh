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

# Testing access to private repositories
echo -e "\nTesting GitHub private repositories access:"
PRIVATE_REPOS_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/repos?visibility=private&per_page=1")
PRIVATE_REPOS_COUNT=$(echo "$PRIVATE_REPOS_RESPONSE" | jq '. | length')
if [ "$PRIVATE_REPOS_COUNT" -eq 0 ]; then
    echo "No private repositories found or no permission to access them."
else
    echo "Found private repositories. First one: $(echo "$PRIVATE_REPOS_RESPONSE" | jq '.[0].full_name')"
fi

echo -e "\nTesting GitHub organization access:"
echo "Method 1 - Using /user/orgs endpoint:"
ORG_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/orgs")
ORG_COUNT=$(echo "$ORG_RESPONSE" | jq '. | length')
if [ "$ORG_COUNT" -eq 0 ]; then
    echo "No organizations found via /user/orgs endpoint."
else
    echo "Organizations found via /user/orgs:"
    echo "$ORG_RESPONSE" | jq '.[].login'
fi

echo "Method 2 - Looking for specific organizations:"
for org in "Gameplex-labs" "Neucruit" "uiastra"; do
    ORG_DETAILS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/orgs/$org")
    if [[ $(echo "$ORG_DETAILS" | jq 'has("login")') == "true" ]]; then
        echo "Found organization: $org"
        
        # Check if we can access the organization's repositories
        ORG_REPOS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/orgs/$org/repos?per_page=1")
        REPO_COUNT=$(echo "$ORG_REPOS" | jq '. | length')
        if [ "$REPO_COUNT" -gt 0 ]; then
            echo "  Can access repositories for $org"
            echo "  Example repo: $(echo "$ORG_REPOS" | jq '.[0].full_name')"
        else
            echo "  Cannot access repositories for $org or organization has no repositories"
        fi
    else
        echo "Could not find organization: $org (or no permission to access it)"
    fi
done

echo -e "\nTesting GitHub starred repos access:"
STARRED_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/starred?per_page=1")
STARRED_COUNT=$(echo "$STARRED_RESPONSE" | jq '. | length')
if [ "$STARRED_COUNT" -eq 0 ]; then
    echo "No starred repositories found. You may not have starred any GitHub repositories."
else
    echo "First starred repo: $(echo "$STARRED_RESPONSE" | jq '.[0].full_name')"
    echo "Total starred repositories accessible: $(curl -s -H "Authorization: token $GITHUB_TOKEN" -I "https://api.github.com/user/starred" | grep -i "^link:" | grep -o "page=[0-9]*" | sort -r | head -1 | cut -d= -f2 || echo "Unknown")"
fi

echo -e "\nVerifying GitHub token scopes:"
SCOPES=$(curl -s -I -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user" | grep -i "^x-oauth-scopes:" | cut -d ":" -f 2- | tr -d '\r' || echo "None found")
if [ -z "$SCOPES" ] || [ "$SCOPES" = "None found" ]; then
    echo "No explicit scopes found in GitHub token. This may be a personal access token (classic) with default scopes."
    echo "Testing functionality directly:"
    echo "- Can access user info: $(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user")"
    echo "- Can access private repos: $(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/repos?visibility=private&per_page=1")"
    echo "- Can access organizations: $(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/orgs")"
    echo "- Can access starred repos: $(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/starred?per_page=1")"
else
    echo "Your token has these scopes: $SCOPES"
fi

echo -e "\nRequired scopes for full functionality:"
echo "- repo (for repositories and issues)"
echo "- read:org (for organization access)"
echo "- user (for starred repositories)"

echo -e "\nYour environment should now be ready for testing."
echo "Run ./run-local.sh to start the mirroring process."