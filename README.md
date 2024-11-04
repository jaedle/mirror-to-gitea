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

## Prerequisites

- A github user or organization with repositories
- Configured Gitea instance up and running
- User for Gitea with generated token (Settings -> Applications -> Generate New Token)
- Docker or Docker Compose

## Running

### Configuration

All configuration is performed through environment variables. Flags are considered `true` on `true`, `TRUE` or `1`.

| Parameter                   | Required | Type   | Default | Description                                                                                                                                                                                                                                |
|-----------------------------|----------|--------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| GITHUB_USERNAME             | yes      | string | -       | The name of the GitHub user or organisation to mirror.                                                                                                                                                                                     |
| GITEA_URL                   | yes      | string | -       | The url of your Gitea server.                                                                                                                                                                                                              |
| GITEA_TOKEN                 | yes      | string | -       | The token for your gitea user (Settings -> Applications -> Generate New Token). **Attention: if this is set, the token will be transmitted to your specified Gitea instance!**                                                             |
| GITHUB_TOKEN                | no*      | string | -       | GitHub token (PAT). Is mandatory in combination with `MIRROR_PRIVATE_REPOSITORIES`.                                                                                                                                                        |
| MIRROR_PRIVATE_REPOSITORIES | no       | bool   | FALSE   | If set to `true` your private GitHub Repositories will be mirrored to Gitea. Requires `GITHUB_TOKEN`.                                                                                                                                      |
| SKIP_FORKS                  | no       | bool   | FALSE   | If set to `true` will disable the mirroring of forks from your GitHub User / Organisation.                                                                                                                                                 |
| DELAY                       | no       | int    | 3600    | Number of seconds between program executions. Setting this will only affect how soon after a new repo was created a mirror may appar on Gitea, but has no affect on the ongoing replication. If set to `0` the task is only executed once. |
| DRY_RUN                     | no       | bool   | FALSE   | If set to `true` will perform no writing changes to your Gitea instance, but log the planned actions.                                                                                                                                      |
| INCLUDE                     | no       | string | "*"     | Name based repository filter (include): If any filter matches, the repository will be mirrored. It supports glob format, multiple filters can be separated with commas (`,`)                                                               |
| EXCLUDE                     | no       | string | ""      | Name based repository filter (exclude). If any filter matches, the repository will not be mirrored. It supports glob format, multiple filters can be separated with commas (`,`). `EXCLUDE` filters are applied after `INCLUDE` ones.      |

### Docker

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://your-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 jaedle/mirror-to-gitea:latest
```

This will a spin up a docker container which will run forever, mirroring all your repositories once every hour to your
gitea server.

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
