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
			? await fetchStarredRepositories(octokit, {
				username: mirrorOptions.useSpecificUser ? mirrorOptions.username : undefined
			})
			: [];

		// Fetch organization repos if the option is enabled
		const orgRepos = mirrorOptions.mirrorOrganizations
			? await fetchOrganizationRepositories(
				octokit,
				mirrorOptions.includeOrgs,
				mirrorOptions.excludeOrgs,
				mirrorOptions.preserveOrgStructure,
				{
					username: mirrorOptions.useSpecificUser ? mirrorOptions.username : undefined,
					privateRepositories: mirrorOptions.privateRepositories
				}
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

async function fetchStarredRepositories(octokit, options = {}) {
	// If a specific username is provided, use the user-specific endpoint
	if (options.username) {
		return octokit
			.paginate("GET /users/{username}/starred", {
				username: options.username,
				headers: {
					'X-GitHub-Api-Version': '2022-11-28'
				}
			})
			.then(repos => toRepositoryList(repos.map(repo => ({ ...repo, starred: true }))));
	}

	// Default: Get starred repos for the authenticated user (what was previously used)
	return octokit
		.paginate("GET /user/starred")
		.then(repos => toRepositoryList(repos.map(repo => ({ ...repo, starred: true }))));
}

async function fetchOrganizationRepositories(octokit, includeOrgs = [], excludeOrgs = [], preserveOrgStructure = false, options = {}) {
	try {
		// Get all organizations the user belongs to
		let allOrgs;

		// If a specific username is provided, use the user-specific endpoint
		if (options.username) {
			allOrgs = await octokit.paginate("GET /users/{username}/orgs", {
				username: options.username,
				headers: {
					'X-GitHub-Api-Version': '2022-11-28'
				}
			});
		} else {
			// Default: Get organizations for the authenticated user (what was previously used)
			allOrgs = await octokit.paginate("GET /user/orgs");
		}

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

		// Determine if we need to fetch private repositories
		const privateRepoAccess = options.privateRepositories && octokit.auth;
		const allOrgRepos = [];

		// Process each organization
		for (const org of orgsToProcess) {
			const orgName = org.login;
			console.log(`Fetching repositories for organization: ${orgName}`);

			try {
				let orgRepos = await octokit.paginate("GET /orgs/{org}/repos", {
					org: orgName,
					per_page: 100
				});
				console.log(`Found ${orgRepos.length} public repositories for org: ${orgName}`);

				if (!options.privateRepositories) {
					orgRepos = orgRepos.filter(repo => !repo.private);
				}

				// Add organization context to each repository if preserveOrgStructure is enabled
				if (preserveOrgStructure) {
					orgRepos = orgRepos.map(repo => ({
						...repo,
						organization: orgName
					}));
				}

				allOrgRepos.push(...orgRepos);
			} catch (orgError) {
				console.error(`Error fetching repositories for org ${orgName}:`, orgError.message);
			}
		}

		// Convert to repository list format
		return toRepositoryList(allOrgRepos, preserveOrgStructure);
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

		// Preserve starred status if present
		if (repository.starred) {
			repoInfo.starred = true;
		}

		return repoInfo;
	});
}

export default getRepositories;
