const {Octokit} = require('@octokit/rest');
const request = require('superagent');
const {default: PQueue} = require('p-queue');


async function getGithubRepositories(username, token, mirrorPrivateRepositories) {
  const octokit = new Octokit({
    auth: token || null,
  });
  
  const publicRepositoriesWithForks = await octokit.paginate('GET /users/:username/repos', { username: username })
      .then(repositories => toRepositoryList(repositories));

  let allRepositoriesWithoutForks;
  if(mirrorPrivateRepositories === 'true'){
  allRepositoriesWithoutForks = await octokit.paginate('GET /user/repos?visibility=public&affiliation=owner&visibility=private')
    .then(repositories => toRepositoryList(repositories));
  }

  if(mirrorPrivateRepositories === 'true'){
    return filterDuplicates(allRepositoriesWithoutForks.concat(publicRepositoriesWithForks));
  }else{
    return publicRepositoriesWithForks;
  }
}

function toRepositoryList(repositories) {
  return repositories.map(repository => {
    return { name: repository.name, url: repository.clone_url, private: repository.private };
  });
}

function filterDuplicates(array) {
  var a = array.concat();
  for(var i=0; i<a.length; ++i) {
      for(var j=i+1; j<a.length; ++j) {
          if(a[i].url === a[j].url)
              a.splice(j--, 1);
      }
  }

  return a;
}

async function getGiteaUser(gitea) {
  return request.get(gitea.url
    + '/api/v1/user')
    .set('Authorization', 'token ' + gitea.token)
    .then(response => {
      return { id: response.body.id, name: response.body.username }
    });
}

function isAlreadyMirroredOnGitea(repository, gitea, giteaUser) {
  const requestUrl = `${gitea.url}/api/v1/repos/${giteaUser.name}/${repository}`;
  return request.get(
    requestUrl)
    .set('Authorization', 'token ' + gitea.token)
    .then(() => true)
    .catch(() => false);
}

function mirrorOnGitea(repository, gitea, giteaUser, githubToken) {
  request.post(`${gitea.url}/api/v1/repos/migrate`)
    .set('Authorization', 'token ' + gitea.token)
    .send({
      auth_token: githubToken || null,
      clone_addr: repository.url,
      mirror: true,
      repo_name: repository.name,
      uid: giteaUser.id,
      private: repository.private
    })
    .then(() => {
      console.log('Did it!');
    })
    .catch(err => {
      console.log('Failed', err);
    });

}

async function mirror(repository, gitea, giteaUser, githubToken, dryRun) {
  if (await isAlreadyMirroredOnGitea(repository.name,
    gitea,
    giteaUser)) {
    console.log('Repository is already mirrored; doing nothing: ', repository.name);
    return;
  }
  if (dryRun) {
    console.log('DRY RUN: Would mirror repository to gitea: ', repository);
    return;
  }
  console.log('Mirroring repository to gitea: ', repository.name);
  await mirrorOnGitea(repository, gitea, giteaUser, githubToken);
}

async function main() {
  const githubUsername = process.env.GITHUB_USERNAME;
  if (!githubUsername) {
    console.error('No GITHUB_USERNAME specified, please specify! Exiting..');
    return;
  }
  const githubToken = process.env.GITHUB_TOKEN;
  const giteaUrl = process.env.GITEA_URL;

  if (!giteaUrl) {
    console.error('No GITEA_URL specified, please specify! Exiting..');
    return;
  }

  const giteaToken = process.env.GITEA_TOKEN;
  if (!giteaToken) {
    console.error('No GITEA_TOKEN specified, please specify! Exiting..');
    return;
  }

  const mirrorPrivateRepositories = process.env.MIRROR_PRIVATE_REPOSITORIES;
  if(mirrorPrivateRepositories === 'true' && !githubToken){
    console.error('MIRROR_PRIVATE_REPOSITORIES was set to true but no GITHUB_TOKEN was specified, please specify! Exiting..')
    return;
  }

  const dryRun = ['1', 'true'].includes(process.env.DRY_RUN);

  const githubRepositories = await getGithubRepositories(githubUsername, githubToken, mirrorPrivateRepositories);
  console.log(`Found ${githubRepositories.length} repositories on github`);

  const gitea = {
    url: giteaUrl,
    token: giteaToken,
  };
  const giteaUser = await getGiteaUser(gitea);

  const queue = new PQueue({ concurrency: 4 });
  await queue.addAll(githubRepositories.map(repository => {
    return async () => {
      await mirror(repository, gitea, giteaUser, githubToken, dryRun);
    };
  }));
}

main();
