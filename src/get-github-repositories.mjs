async function getRepositories(octokit, mirrorOptions) {
	const publicRepositories = await fetchPublicRepositories(
		octokit,
		mirrorOptions.username,
	);
	const privateRepos = mirrorOptions.privateRepositories
		? await fetchPrivateRepositories(octokit)
		: [];
	const repos = [...publicRepositories, ...privateRepos];

	return mirrorOptions.skipForks ? withoutForks(repos) : repos;
}

async function fetchPublicRepositories(octokit, username) {
	return octokit
		.paginate("GET /users/:username/repos", { username })
		.then(toRepositoryList);
}

async function fetchPrivateRepositories(octokit) {
	return octokit
		.paginate("GET /user/repos", {
			affiliation: "owner",
			visibility: "private",
		})
		.then(toRepositoryList);
}

function withoutForks(repositories) {
	return repositories.filter((repo) => !repo.fork);
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

export default getRepositories;
