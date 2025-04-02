async function getRepositories(octokit, mirrorOptions) {
	const publicRepositories = await fetchPublicRepositories(
		octokit,
		mirrorOptions.username,
	);
	const privateRepos = mirrorOptions.privateRepositories
		? await fetchPrivateRepositories(octokit)
		: [];
	
	// Fetch starred repos if the option is enabled
	const starredRepos = mirrorOptions.mirrorStarred
		? await fetchStarredRepositories(octokit)
		: [];
	
	// Fetch organization repos if the option is enabled
	const orgRepos = mirrorOptions.mirrorOrganizations
		? await fetchOrganizationRepositories(octokit)
		: [];
	
	// Combine all repositories and filter duplicates
	const repos = filterDuplicates([
		...publicRepositories, 
		...privateRepos,
		...starredRepos,
		...orgRepos
	]);

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

async function fetchStarredRepositories(octokit) {
	return octokit
		.paginate("GET /user/starred")
		.then(toRepositoryList);
}

async function fetchOrganizationRepositories(octokit) {
	// First get all organizations the user belongs to
	const orgs = await octokit.paginate("GET /user/orgs");
	
	// Then fetch repositories for each organization
	const orgRepoPromises = orgs.map(org => 
		octokit.paginate("GET /orgs/{org}/repos", { org: org.login })
	);
	
	// Wait for all requests to complete and flatten the results
	const orgRepos = await Promise.all(orgRepoPromises)
		.then(repoArrays => repoArrays.flat())
		.then(toRepositoryList);
	
	return orgRepos;
}

function withoutForks(repositories) {
	return repositories.filter((repo) => !repo.fork);
}

function filterDuplicates(repositories) {
	const unique = [];
	const seen = new Set();
	
	for (const repo of repositories) {
		if (!seen.has(repo.url)) {
			seen.add(repo.url);
			unique.push(repo);
		}
	}
	
	return unique;
}

function toRepositoryList(repositories) {
	return repositories.map((repository) => {
		return {
			name: repository.name,
			url: repository.clone_url,
			private: repository.private,
			fork: repository.fork,
			owner: repository.owner?.login,
			full_name: repository.full_name,
			has_issues: repository.has_issues,
		};
	});
}

export default getRepositories;
