import { Octokit } from "@octokit/rest";
import { minimatch } from "minimatch";
import PQueue from "p-queue";
import request from "superagent";
import { configuration } from "./configuration.mjs";

async function getGithubRepositories(
	username,
	token,
	mirrorPrivateRepositories,
	mirrorForks,
	include,
	exclude,
) {
	const octokit = new Octokit({
		auth: token || null,
	});

	const publicRepositories = await octokit
		.paginate("GET /users/:username/repos", { username: username })
		.then((repositories) => toRepositoryList(repositories));

	let allOwnedRepositories;
	if (mirrorPrivateRepositories) {
		allOwnedRepositories = await octokit
			.paginate(
				"GET /user/repos?visibility=public&affiliation=owner&visibility=private",
			)
			.then((repositories) => toRepositoryList(repositories));
	}

	let repositories = publicRepositories;

	if (mirrorPrivateRepositories) {
		repositories = filterDuplicates(
			allOwnedRepositories.concat(publicRepositories),
		);
	}

	if (!mirrorForks) {
		repositories = repositories.filter((repository) => !repository.fork);
	}

	repositories = repositories.filter(
		(repository) =>
			include.some((f) => minimatch(repository.name, f)) &&
			!exclude.some((f) => minimatch(repository.name, f)),
	);

	return repositories;
}

function toRepositoryList(repositories) {
	return repositories.map((repository) => {
		return {
			name: repository.name,
			url: repository.clone_url,
			private: repository.private,
			fork: repository.fork,
		};
	});
}

function filterDuplicates(array) {
	const a = array.concat();
	for (let i = 0; i < a.length; ++i) {
		for (let j = i + 1; j < a.length; ++j) {
			if (a[i].url === a[j].url) a.splice(j--, 1);
		}
	}

	return a;
}

async function getGiteaUser(gitea) {
	return request
		.get(`${gitea.url}/api/v1/user`)
		.set("Authorization", `token ${gitea.token}`)
		.then((response) => {
			return { id: response.body.id, name: response.body.username };
		});
}

function isAlreadyMirroredOnGitea(repository, gitea, giteaUser) {
	const requestUrl = `${gitea.url}/api/v1/repos/${giteaUser.name}/${repository}`;
	return request
		.get(requestUrl)
		.set("Authorization", `token ${gitea.token}`)
		.then(() => true)
		.catch(() => false);
}

function mirrorOnGitea(repository, gitea, giteaUser, githubToken) {
	request
		.post(`${gitea.url}/api/v1/repos/migrate`)
		.set("Authorization", `token ${gitea.token}`)
		.send({
			auth_token: githubToken || null,
			clone_addr: repository.url,
			mirror: true,
			repo_name: repository.name,
			uid: giteaUser.id,
			private: repository.private,
		})
		.then(() => {
			console.log("Did it!");
		})
		.catch((err) => {
			console.log("Failed", err);
		});
}

async function mirror(repository, gitea, giteaUser, githubToken, dryRun) {
	if (await isAlreadyMirroredOnGitea(repository.name, gitea, giteaUser)) {
		console.log(
			"Repository is already mirrored; doing nothing: ",
			repository.name,
		);
		return;
	}
	if (dryRun) {
		console.log("DRY RUN: Would mirror repository to gitea: ", repository);
		return;
	}
	console.log("Mirroring repository to gitea: ", repository.name);
	await mirrorOnGitea(repository, gitea, giteaUser, githubToken);
}

async function main() {
	let config;
	try {
		config = configuration();
	} catch (e) {
		console.error("invalid configuration", e);
		process.exit(1);
	}

	console.log("Starting with the following configuration:");
	console.log(` - GITHUB_USERNAME: ${config.github.username}`);
	console.log(` - GITHUB_TOKEN: ${config.github.token ? "****" : ""}`);
	console.log(
		` - MIRROR_PRIVATE_REPOSITORIES: ${config.github.privateRepositories}`,
	);
	console.log(` - GITEA_URL: ${config.gitea.url}`);
	console.log(` - GITEA_TOKEN: ${config.gitea.token ? "****" : ""}`);
	console.log(` - SKIP_FORKS: ${config.github.skipForks}`);
	console.log(` - DRY_RUN: ${config.dryRun}`);
	console.log(` - INCLUDE: ${config.include}`);
	console.log(` - EXCLUDE: ${config.exclude}`);

	const githubRepositories = await getGithubRepositories(
		config.github.username,
		config.github.token,
		config.github.privateRepositories,
		!config.github.skipForks,
		config.include,
		config.exclude,
	);

	console.log(`Found ${githubRepositories.length} repositories on github`);

	const gitea = {
		url: config.gitea.url,
		token: config.gitea.token,
	};
	const giteaUser = await getGiteaUser(gitea);

	const queue = new PQueue({ concurrency: 4 });
	await queue.addAll(
		githubRepositories.map((repository) => {
			return async () => {
				await mirror(
					repository,
					gitea,
					giteaUser,
					config.github.token,
					config.dryRun,
				);
			};
		}),
	);
}

main();
