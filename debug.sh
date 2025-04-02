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
echo "Method 1 - Using /user/orgs endpoint (authenticated user):"
ORG_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/orgs")
ORG_COUNT=$(echo "$ORG_RESPONSE" | jq '. | length')
if [ "$ORG_COUNT" -eq 0 ]; then
    echo "No organizations found via /user/orgs endpoint."
else
    echo "Organizations found via /user/orgs:"
    echo "$ORG_RESPONSE" | jq '.[].login'
fi

echo -e "\nMethod 2 - Using /users/{username}/orgs endpoint (specific user):"
PUBLIC_USER_ORGS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" "https://api.github.com/users/$GITHUB_USERNAME/orgs")
PUBLIC_ORG_COUNT=$(echo "$PUBLIC_USER_ORGS" | jq '. | length')
if [ "$PUBLIC_ORG_COUNT" -eq 0 ]; then
    echo "No public organizations found for $GITHUB_USERNAME via /users/{username}/orgs endpoint."
else
    echo "Public organizations found for $GITHUB_USERNAME:"
    echo "$PUBLIC_USER_ORGS" | jq '.[].login'
fi

echo "Method 3 - Looking for specific organizations:"
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
echo "Method 1 - Using /user/starred endpoint (authenticated user):"
STARRED_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/starred?per_page=1")
STARRED_COUNT=$(echo "$STARRED_RESPONSE" | jq '. | length')
if [ "$STARRED_COUNT" -eq 0 ]; then
    echo "No starred repositories found. You may not have starred any GitHub repositories."
else
    echo "First starred repo: $(echo "$STARRED_RESPONSE" | jq '.[0].full_name')"
    echo "Total starred repositories accessible: $(curl -s -H "Authorization: token $GITHUB_TOKEN" -I "https://api.github.com/user/starred" | grep -i "^link:" | grep -o "page=[0-9]*" | sort -r | head -1 | cut -d= -f2 || echo "Unknown")"
fi

echo -e "\nMethod 2 - Using /users/{username}/starred endpoint (specific user):"
PUBLIC_STARRED_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" "https://api.github.com/users/$GITHUB_USERNAME/starred?per_page=1")
PUBLIC_STARRED_COUNT=$(echo "$PUBLIC_STARRED_RESPONSE" | jq '. | length')
if [ "$PUBLIC_STARRED_COUNT" -eq 0 ]; then
    echo "No public starred repositories found for $GITHUB_USERNAME."
else
    echo "First public starred repo for $GITHUB_USERNAME: $(echo "$PUBLIC_STARRED_RESPONSE" | jq '.[0].full_name')"
    echo "Total public starred repositories for $GITHUB_USERNAME: $(curl -s -H "Authorization: token $GITHUB_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" -I "https://api.github.com/users/$GITHUB_USERNAME/starred" | grep -i "^link:" | grep -o "page=[0-9]*" | sort -r | head -1 | cut -d= -f2 || echo "Unknown")"
fi

echo -e "\nTesting GitHub issues access:"
echo "Checking for issues in your repositories..."

# Get a list of repositories to check for issues
USER_REPOS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user/repos?per_page=5&sort=updated")
REPO_COUNT=$(echo "$USER_REPOS" | jq '. | length')

echo "Found $REPO_COUNT recently updated repositories to check for issues"

# Check each repository for issues
for i in $(seq 0 $(($REPO_COUNT - 1))); do
    REPO=$(echo "$USER_REPOS" | jq -r ".[$i].full_name")
    REPO_HAS_ISSUES=$(echo "$USER_REPOS" | jq -r ".[$i].has_issues")
    
    if [ "$REPO_HAS_ISSUES" = "true" ]; then
        ISSUES_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/$REPO/issues?state=all&per_page=1")
        ISSUES_COUNT=$(curl -s -H "Authorization: token $GITHUB_TOKEN" -I "https://api.github.com/repos/$REPO/issues?state=all" | grep -i "^link:" | grep -o "page=[0-9]*" | sort -r | head -1 | cut -d= -f2 || echo "0")
        
        if [ -z "$ISSUES_COUNT" ]; then
            # If we couldn't get the count from Link header, count the array length
            ISSUES_COUNT=$(echo "$ISSUES_RESPONSE" | jq '. | length')
        fi
        
        if [ "$ISSUES_COUNT" -gt 0 ]; then
            echo "Repository $REPO has approximately $ISSUES_COUNT issues"
            echo "Latest issue: $(echo "$ISSUES_RESPONSE" | jq -r '.[0].title // "No title"')"
        else
            echo "Repository $REPO has issues enabled but no issues were found"
        fi
    else
        echo "Repository $REPO has issues disabled"
    fi
done

echo -e "\nVerifying GitHub token scopes for issues access:"
SCOPES=$(curl -s -I -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/user" | grep -i "^x-oauth-scopes:" | cut -d ":" -f 2- | tr -d '\r' || echo "None found")

if [[ "$SCOPES" == *"repo"* ]]; then
    echo "Your token has the 'repo' scope, which is required for issues access"
else
    echo "WARNING: Your token may not have the 'repo' scope, which is required for full issues access"
    echo "Testing issues access directly: $(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/$GITHUB_USERNAME/$(echo "$USER_REPOS" | jq -r '.[0].name')/issues")"
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

echo -e "\nSpecific user mode tests (USE_SPECIFIC_USER=true):"
echo "This mode uses the following endpoints:"
echo "- GET /users/{username}/orgs"
echo "- GET /users/{username}/starred"
echo "These endpoints are working: $([ "$PUBLIC_ORG_COUNT" -ge 0 ] && [ "$PUBLIC_STARRED_COUNT" -ge 0 ] && echo "YES" || echo "NO")"

echo -e "\nYour environment should now be ready for testing."
echo "To test with the new USE_SPECIFIC_USER feature:"
echo "export USE_SPECIFIC_USER=true"
echo "Run ./run-local.sh to start the mirroring process."