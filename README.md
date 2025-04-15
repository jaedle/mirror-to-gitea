# Automatically Mirror Github Repo To Your Gitea Server

## Badges

[![image pulls](https://img.shields.io/docker/pulls/jaedle/mirror-to-gitea.svg)](https://cloud.docker.com/repository/docker/jaedle/mirror-to-gitea)

## Description

This script automatically mirrors the repositories from a github-user or github-organization to your gitea server.
Once started, it will create a mirrored repository under a given token for a gitea user, completely automatically.

Example:
A github user `github-user` has public repositories `dotfiles` and `zsh-config`.
Starting the script with a gitea token for the account `gitea-user` will create the following mirrored repositories:

- github.com/github-user/dotfiles &rarr; your-gitea.url/gitea-user/dotfiles
- github.com/github-user/zsh-config &rarr; your-gitea.url/gitea-user/zsh-config

The mirror settings are default by your gitea instance.

It is also possible to mirror private repos, which can be configred here in [#parameters](#parameters). When mirroring
private repos, they will be created as private repos on your gitea server.

Additionally, you can now mirror:
- Issues from GitHub repositories (including labels)
- Starred repositories from your GitHub account
- Repositories from organizations you belong to
  - Filter which organizations to include or exclude
  - Maintain original organization structure in Gitea
- Public repositories from any GitHub organization (even if you're not a member)
- A single repository instead of all repositories
- Repositories to a specific Gitea organization

## Prerequisites

- A github user or organization with repositories
- Configured Gitea instance up and running
- User for Gitea with generated token (Settings -> Applications -> Generate New Token)
- Docker or Docker Compose

## Running

### Configuration

All configuration is performed through environment variables. Flags are considered `true` on `true`, `TRUE` or `1`.

| Parameter                   | Required | Type   | Default | Description                                                                                                                                                                                            |
|-----------------------------|----------|--------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| GITHUB_USERNAME             | yes      | string | -       | The name of the GitHub user or organisation to mirror.                                                                                                                                                 |
| GITEA_URL                   | yes      | string | -       | The url of your Gitea server.                                                                                                                                                                          |
| GITEA_TOKEN                 | yes      | string | -       | The token for your gitea user (Settings -> Applications -> Generate New Token). **Attention: if this is set, the token will be transmitted to your specified Gitea instance!**                         |
| GITHUB_TOKEN                | no*      | string | -       | GitHub token (PAT). Is mandatory in combination with `MIRROR_PRIVATE_REPOSITORIES`, `MIRROR_ISSUES`, `MIRROR_STARRED`, `MIRROR_ORGANIZATIONS`, `MIRROR_PUBLIC_ORGS`, or `SINGLE_REPO`.                |
| MIRROR_PRIVATE_REPOSITORIES | no       | bool   | FALSE   | If set to `true` your private GitHub Repositories will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                                  |
| MIRROR_ISSUES               | no       | bool   | FALSE   | If set to `true` the issues of your GitHub repositories will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                           |
| MIRROR_STARRED              | no       | bool   | FALSE   | If set to `true` repositories you've starred on GitHub will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                             |
| MIRROR_ORGANIZATIONS        | no       | bool   | FALSE   | If set to `true` repositories from organizations you belong to will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                     |
| MIRROR_PUBLIC_ORGS          | no       | bool   | FALSE   | If set to `true` repositories from public organizations specified in `PUBLIC_ORGS` will be mirrored to Gitea, even if you're not a member. Requires `GITHUB_TOKEN`.                                   |
| PUBLIC_ORGS                 | no       | string | ""      | Comma-separated list of public GitHub organization names to mirror when `MIRROR_PUBLIC_ORGS=true`. Case-insensitive.                                                                                    |
| ONLY_MIRROR_ORGS            | no       | bool   | FALSE   | If set to `true` only repositories from organizations will be mirrored, skipping personal repositories. Requires `MIRROR_ORGANIZATIONS=true` or `MIRROR_PUBLIC_ORGS=true`.                           |
| USE_SPECIFIC_USER           | no       | bool   | FALSE   | If set to `true`, the tool will use public API endpoints to fetch starred repositories and organizations for the specified `GITHUB_USERNAME` instead of the authenticated user.                        |
| INCLUDE_ORGS                | no       | string | ""      | Comma-separated list of GitHub organization names to include when mirroring organizations you belong to. If not specified, all organizations will be included. Case-insensitive.                       |
| EXCLUDE_ORGS                | no       | string | ""      | Comma-separated list of GitHub organization names to exclude when mirroring organizations. Takes precedence over `INCLUDE_ORGS`. Case-insensitive.                                                    |
| PRESERVE_ORG_STRUCTURE      | no       | bool   | FALSE   | If set to `true`, each GitHub organization will be mirrored to a Gitea organization with the same name. If the organization doesn't exist, it will be created.                                         |
| SINGLE_REPO                 | no       | string | -       | URL of a single GitHub repository to mirror (e.g., https://github.com/username/repo or username/repo). When specified, only this repository will be mirrored. Requires `GITHUB_TOKEN`.                 |
| GITEA_ORGANIZATION          | no       | string | -       | Name of a Gitea organization to mirror repositories to. If doesn't exist, will be created.                                                                                                             |
| GITEA_ORG_VISIBILITY        | no       | string | public  | Visibility of the Gitea organization to create. Can be "public" or "private".                                                                                                                          |
| GITEA_STARRED_ORGANIZATION  | no       | string | github  | Name of a Gitea organization to mirror starred repositories to. If doesn't exist, will be created. Defaults to "github".                                                                               |
| SKIP_STARRED_ISSUES         | no       | bool   | FALSE   | If set to `true` will not mirror issues for starred repositories, even if `MIRROR_ISSUES` is enabled.                                                                                                  |
| SKIP_FORKS                  | no       | bool   | FALSE   | If set to `true` will disable the mirroring of forks from your GitHub User / Organisation.                                                                                                             |
| DELAY                       | no       | int    | 3600    | Number of seconds between program executions. Setting this will only affect how soon after a new repo was created a mirror may appear on Gitea, but has no effect on the ongoing replication.           |
| DRY_RUN                     | no       | bool   | FALSE   | If set to `true` will perform no writing changes to your Gitea instance, but log the planned actions.                                                                                                  |
| INCLUDE                     | no       | string | "*"     | Name based repository filter (include): If any filter matches, the repository will be mirrored. It supports glob format, multiple filters can be separated with commas (`,`)                           |
| EXCLUDE                     | no       | string | ""      | Name based repository filter (exclude). If any filter matches, the repository will not be mirrored. It supports glob format, multiple filters can be separated with commas (`,`). `EXCLUDE` filters are applied after `INCLUDE` ones.
| SINGLE_RUN                  | no       | bool   | FALSE   | If set to `TRUE` the task is only executed once.                                                                                                                                                       |

### Docker

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e MIRROR_ISSUES=true \
 -e MIRROR_STARRED=true \
 -e MIRROR_ORGANIZATIONS=true \
 jaedle/mirror-to-gitea:latest
```

### Mirror Only Specific Organizations

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e MIRROR_ORGANIZATIONS=true \
 -e INCLUDE_ORGS=org1,org2,org3 \
 jaedle/mirror-to-gitea:latest
```

### Mirror Organizations with Preserved Structure

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e MIRROR_ORGANIZATIONS=true \
 -e PRESERVE_ORG_STRUCTURE=true \
 -e GITEA_ORG_VISIBILITY=private \
 jaedle/mirror-to-gitea:latest
```

### Mirror Only Organization Repositories

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e MIRROR_ORGANIZATIONS=true \
 -e ONLY_MIRROR_ORGS=true \
 -e PRESERVE_ORG_STRUCTURE=true \
 jaedle/mirror-to-gitea:latest
```

### Mirror a Single Repository

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e SINGLE_REPO=https://github.com/organization/repository \
 jaedle/mirror-to-gitea:latest
```

### Mirror to a Gitea Organization

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e GITEA_ORGANIZATION=my-organization \
 -e GITEA_ORG_VISIBILITY=private \
 jaedle/mirror-to-gitea:latest
```

### Mirror Starred Repositories to a Dedicated Organization

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e MIRROR_STARRED=true \
 -e GITEA_STARRED_ORGANIZATION=github \
 -e SKIP_STARRED_ISSUES=true \
 jaedle/mirror-to-gitea:latest
```

This configuration will mirror all starred repositories to a Gitea organization named "github" and will not mirror issues for these starred repositories.

### Mirror Public Organizations

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 -e GITHUB_TOKEN=your-github-token \
 -e MIRROR_PUBLIC_ORGS=true \
 -e PUBLIC_ORGS=proxmox,kubernetes,microsoft \
 -e PRESERVE_ORG_STRUCTURE=true \
 jaedle/mirror-to-gitea:latest
```

This configuration will mirror public repositories from the specified public organizations (Proxmox, Kubernetes, and Microsoft) even if you're not a member of these organizations. The repositories will be organized under matching organization names in Gitea.

### Docker Compose

```yaml
version: "3.3"
services:
  mirror-to-gitea:
    image: jaedle/mirror-to-gitea:latest
    restart: unless-stopped
    container_name: mirror-to-gitea
    environment:
      - GITHUB_USERNAME=github-user
      - GITEA_URL=https://your-gitea.url
      - GITEA_TOKEN=please-exchange-with-token
      - GITHUB_TOKEN=your-github-token
      - MIRROR_ISSUES=true
      - MIRROR_STARRED=true
      - MIRROR_ORGANIZATIONS=true
      # Organization specific options
      # - INCLUDE_ORGS=org1,org2
      # - EXCLUDE_ORGS=org3,org4
      # - PRESERVE_ORG_STRUCTURE=true
      # - ONLY_MIRROR_ORGS=true
      # Public organization options
      # - MIRROR_PUBLIC_ORGS=true
      # - PUBLIC_ORGS=proxmox,kubernetes,microsoft
      # Other options
      # - SINGLE_REPO=https://github.com/organization/repository
      # - GITEA_ORGANIZATION=my-organization
      # - GITEA_ORG_VISIBILITY=public
```

## Development

### Prerequisites

- nodejs
- [task](https://taskfile.dev)
- docker

### Execute verification

```sh
task world
```

### Running locally

Create `.secrets.rc` containing at least the following variables:

```rc
export GITHUB_USERNAME='...'
export GITHUB_TOKEN='...'
export GITEA_URL='...'
export GITEA_TOKEN='...'
export MIRROR_ISSUES=true
export MIRROR_STARRED=true
export MIRROR_ORGANIZATIONS=true
# export ONLY_MIRROR_ORGS=true
# export INCLUDE_ORGS='org1,org2'
# export EXCLUDE_ORGS='org3,org4'
# export PRESERVE_ORG_STRUCTURE=true
# Public organization options
# export MIRROR_PUBLIC_ORGS=true
# export PUBLIC_ORGS='proxmox,kubernetes,microsoft'
# Other options
# export SINGLE_REPO='https://github.com/user/repo'
# export GITEA_ORGANIZATION='my-organization'
# export GITEA_ORG_VISIBILITY='public'
```

Execute the script in foreground:

```sh
task run-local
```

### Testing Organization Mirroring

To test organization mirroring specifically, you can use the provided `test-org-mirror.sh` script:

```sh
./test-org-mirror.sh
```

This script will:
1. Build the Docker image
2. Run the container with the following settings:
   - `MIRROR_ORGANIZATIONS=true` - Enable organization mirroring
   - `ONLY_MIRROR_ORGS=true` - Only mirror organization repositories, skip personal repositories
   - `PRESERVE_ORG_STRUCTURE=true` - Create matching organizations in Gitea

### Common Issues and Troubleshooting

#### GitHub Token Requirements

When mirroring organizations, be aware that some organizations have policies that restrict access via personal access tokens. If you encounter an error like:

```
The 'OrgName' organization forbids access via a fine-grained personal access tokens if the token's lifetime is greater than 366 days.
```

You'll need to:
1. Go to your GitHub account settings
2. Navigate to Personal Access Tokens
3. Create a new token with a lifetime less than 366 days
4. Update the `GITHUB_TOKEN` in your `.secrets.rc` file

#### No Organizations Found

If you see a message like:

```
Found 0 organizations:
No organizations to process after filtering. Check your INCLUDE_ORGS and EXCLUDE_ORGS settings.
```

Possible causes and solutions:
- **Token permissions**: Ensure your GitHub token has the `read:org` scope
- **Organization membership**: Verify you are a member of the organizations you're trying to mirror
- **Include/Exclude settings**: Check your `INCLUDE_ORGS` and `EXCLUDE_ORGS` settings

#### No Repositories Found for Organization

If you see a message like:

```
Found 0 repositories for org: OrgName
```

Possible causes and solutions:
- **Repository access**: Ensure you have access to the repositories in the organization
- **Empty organization**: The organization might not have any repositories
- **Token permissions**: Ensure your GitHub token has the `repo` scope for private repositories

#### Organization Creation Fails in Gitea

If you see errors when creating organizations in Gitea:

```
Error creating Gitea organization OrgName: ...
```

Possible causes and solutions:
- **Gitea token permissions**: Ensure your Gitea token has organization creation permissions
- **Organization already exists**: The organization might already exist in Gitea with a different case (Gitea is case-insensitive for organization names)
- **Gitea version**: Ensure you're using a compatible version of Gitea

> Note: Local Gitea instance for testing
```sh
docker network create gitea
docker volume create --driver local gitea

docker run -d \
  --name gitea \
  --restart always \
  --network gitea \
  -v gitea:/data \
  -v /etc/timezone:/etc/timezone:ro \
  -v /etc/localtime:/etc/localtime:ro \
  -p 3000:3000 \
  -p 222:22 \
  docker.gitea.com/gitea:1.23.6
```

## Kudos

Kudos to all contributors! 🙏

<a href="https://github.com/jaedle/mirror-to-gitea/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jaedle/mirror-to-gitea" />
</a>
