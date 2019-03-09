# Mirror your github repositories to your gitea server

# Badges
[![](https://images.microbadger.com/badges/image/jaedle/mirror-to-gitea.svg)](https://microbadger.com/images/jaedle/mirror-to-gitea "Get your own image badge on microbadger.com")


# Description

This script mirrors automatically the public repositories from a github-user or github-organization to your gitea server. 
It will - once started - create a mirrored repository under a given token for a gitea user fully automatically.

Example:
A github user `github-user` has public repositories `dotfiles` and `zsh-config`.
Starting the script with a gitea token for the account `gitea-user` will create the following mirror repositories:

- github.com/github-user/dotfiles &larr; some-gitea.url/gitea-user/dotfiles
- github.com/github-user/zsh-config &larr; some-gitea.url/zsh-config/dotfiles

The mirror settings are default by your gitea instance.

## Prerequisites

- Something to mirror (a github user or organization with public repos)
- Gitea instance up and running
- User for Gitea with generated token
- Docker

## Run it

```sh
docker container run \
 -d \
 --restart always \
 -e GITHUB_USERNAME=github-user \
 -e GITEA_URL=https://some-gitea.url \
 -e GITEA_TOKEN=please-exchange-with-token \
 jaedle/mirror-to-gitea:latest
```

### Parameters

- `GITHUB_USERNAME` name of user or organization which public repos should be mirrored
- `GITEA_URL` url of your gitea server
- `GITEA_TOKEN` token for your gitea user

## Things to do

- configurable interval
- better logging
- use github token to solve problems with rate limits
- add gitlab support
- and so on..
