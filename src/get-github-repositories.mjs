async function getRepositories(octokit, mirrorOptions) {
	let repositories = [];
	
	// Check if we're mirroring a single repo
	if (mirrorOptions.singleRepo) {
		const singleRepo = await fetchSingleRepository(octokit, mirrorOptions.singleRepo);
		if (singleRepo) {
			repositories.push(singleRepo);
		}
	} else {
		// Standard mirroring logic
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
			? await fetchOrganizationRepositories(
				octokit, 
				mirrorOptions.includeOrgs, 
				mirrorOptions.excludeOrgs,
				mirrorOptions.preserveOrgStructure
			)
			: [];
		
		// Combine all repositories and filter duplicates
		repositories = filterDuplicates([
			...publicRepositories, 
			...privateRepos,
			...starredRepos,
			...orgRepos
		]);
	}

	return mirrorOptions.skipForks ? withoutForks(repositories) : repositories;
}

async function fetchSingleRepository(octokit, repoUrl) {
	try {
		// Remove URL prefix if present and clean up
		let repoPath = repoUrl;
		if (repoPath.startsWith('https://github.com/')) {
			repoPath = repoPath.replace('https://github.com/', '');
		}
		if (repoPath.endsWith('.git')) {
			repoPath = repoPath.slice(0, -4);
		}
		
		// Split into owner and repo
		const [owner, repo] = repoPath.split('/');
		if (!owner || !repo) {
			console.error(`Invalid repository URL format: ${repoUrl}`);
			return null;
		}
		
		// Fetch the repository details
		const response = await octokit.rest.repos.get({
			owner,
			repo
		});
		
		return {
			name: response.data.name,
			url: response.data.clone_url,
			private: response.data.private,
			fork: response.data.fork,
			owner: response.data.owner.login,
			full_name: response.data.full_name,
			has_issues: response.data.has_issues,
		};
	} catch (error) {
		console.error(`Error fetching single repository ${repoUrl}:`, error.message);
		return null;
	}
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

async function fetchOrganizationRepositories(octokit, includeOrgs = [], excludeOrgs = [], preserveOrgStructure = false) {
	try {
		// First get all organizations the user belongs to
		const allOrgs = await octokit.paginate("GET /user/orgs");
		
		// Filter organizations based on include/exclude lists
		let orgsToProcess = allOrgs;
		
		if (includeOrgs.length > 0) {
			// Only include specific organizations
			orgsToProcess = orgsToProcess.filter(org => 
				includeOrgs.includes(org.login)
			);
		}
		
		if (excludeOrgs.length > 0) {
			// Exclude specific organizations
			orgsToProcess = orgsToProcess.filter(org => 
				!excludeOrgs.includes(org.login)
			);
		}
		
		console.log(`Processing repositories from ${orgsToProcess.length} organizations`);
		
		// Then fetch repositories for each organization
		const orgRepoPromises = orgsToProcess.map(org => 
			octokit.paginate("GET /orgs/{org}/repos", { org: org.login })
				.then(repos => {
					// Add organization context to each repository if preserveOrgStructure is enabled
					if (preserveOrgStructure) {
						return repos.map(repo => ({
							...repo,
							organization: org.login
						}));
					}
					return repos;
				})
		);
		
		// Wait for all requests to complete and flatten the results
		const orgRepos = await Promise.all(orgRepoPromises)
			.then(repoArrays => repoArrays.flat())
			.then(repos => toRepositoryList(repos, preserveOrgStructure));
		
		return orgRepos;
	} catch (error) {
		console.error("Error fetching organization repositories:", error.message);
		return [];
	}
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

function toRepositoryList(repositories, preserveOrgStructure = false) {
	return repositories.map((repository) => {
		const repoInfo = {
			name: repository.name,
			url: repository.clone_url,
			private: repository.private,
			fork: repository.fork,
			owner: repository.owner?.login,
			full_name: repository.full_name,
			has_issues: repository.has_issues,
		};
		
		// Add organization context if it exists and preserveOrgStructure is enabled
		if (preserveOrgStructure && repository.organization) {
			repoInfo.organization = repository.organization;
		}
		
		return repoInfo;
	});
}

export default getRepositories;
