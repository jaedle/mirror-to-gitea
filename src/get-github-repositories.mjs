async function getRepositories(octokit, mirrorOptions) {
	const repos = await octokit
		.paginate("GET /users/:username/repos", { username: "jaedle" })
		.then(toRepositoryList);

	if (mirrorOptions.skipForks) {
		return repos.filter((repo) => !repo.fork);
	}

	return repos;
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
