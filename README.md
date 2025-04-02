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
| GITHUB_TOKEN                | no*      | string | -       | GitHub token (PAT). Is mandatory in combination with `MIRROR_PRIVATE_REPOSITORIES`, `MIRROR_ISSUES`, `MIRROR_STARRED`, `MIRROR_ORGANIZATIONS`, or `SINGLE_REPO`.                                       |
| MIRROR_PRIVATE_REPOSITORIES | no       | bool   | FALSE   | If set to `true` your private GitHub Repositories will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                                  |
| MIRROR_ISSUES               | no       | bool   | FALSE   | If set to `true` the issues of your GitHub repositories will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                           |
| MIRROR_STARRED              | no       | bool   | FALSE   | If set to `true` repositories you've starred on GitHub will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                             |
| MIRROR_ORGANIZATIONS        | no       | bool   | FALSE   | If set to `true` repositories from organizations you belong to will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                     |
| USE_SPECIFIC_USER           | no       | bool   | FALSE   | If set to `true`, the tool will use public API endpoints to fetch starred repositories and organizations for the specified `GITHUB_USERNAME` instead of the authenticated user.                        |
| INCLUDE_ORGS                | no       | string | ""      | Comma-separated list of GitHub organization names to include when mirroring organizations. If not specified, all organizations will be included.                                                        |
| EXCLUDE_ORGS                | no       | string | ""      | Comma-separated list of GitHub organization names to exclude when mirroring organizations. Takes precedence over `INCLUDE_ORGS`.                                                                       |
| PRESERVE_ORG_STRUCTURE      | no       | bool   | FALSE   | If set to `true`, each GitHub organization will be mirrored to a Gitea organization with the same name. If the organization doesn't exist, it will be created.                                         |
| SINGLE_REPO                 | no       | string | -       | URL of a single GitHub repository to mirror (e.g., https://github.com/username/repo or username/repo). When specified, only this repository will be mirrored. Requires `GITHUB_TOKEN`.                 |
| GITEA_ORGANIZATION          | no       | string | -       | Name of a Gitea organization to mirror repositories to. If doesn't exist, will be created.                                                                                                             |
| GITEA_ORG_VISIBILITY        | no       | string | public  | Visibility of the Gitea organization to create. Can be "public" or "private".                                                                                                                          |
| GITEA_STARRED_ORGANIZATION  | no       | string | github  | Name of a Gitea organization to mirror starred repositories to. If doesn't exist, will be created. Defaults to "github".                                                                               |
| SKIP_STARRED_ISSUES         | no       | bool   | FALSE   | If set to `true` will not mirror issues for starred repositories, even if `MIRROR_ISSUES` is enabled.                                                                                                  |
| SKIP_FORKS                  | no       | bool   | FALSE   | If set to `true` will disable the mirroring of forks from your GitHub User / Organisation.                                                                                                             |
| DELAY                       | no       | int    | 3600    | Number of seconds between program executions. Setting this will only affect how soon after a new repo was created a mirror may appear on Gitea, but has no affect on the ongoing replication.           |
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
export MIRROR_ISSUES='true'
export MIRROR_STARRED='true'
export MIRROR_ORGANIZATIONS='true'
# export INCLUDE_ORGS='org1,org2'
# export EXCLUDE_ORGS='org3,org4'
# export PRESERVE_ORG_STRUCTURE='true'
# export SINGLE_REPO='https://github.com/user/repo'
# export GITEA_ORGANIZATION='my-organization'
# export GITEA_ORG_VISIBILITY='public'
```

Execute the script in foreground:

```sh
task run-local
```

## Kudos

Kudos to all contributors! 🙏

<a href="https://github.com/jaedle/mirror-to-gitea/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jaedle/mirror-to-gitea" />
</a>
