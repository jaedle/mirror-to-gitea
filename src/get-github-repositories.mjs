async function getRepositories(octokit, mirrorOptions) {
	let repositories = [];

	// Check if we're mirroring a single repo
	if (mirrorOptions.singleRepo) {
		const singleRepo = await fetchSingleRepository(octokit, mirrorOptions.singleRepo);
		if (singleRepo) {
			repositories.push(singleRepo);
		}
	} else {
		// Fetch member organization repos if the option is enabled
		const orgRepos = mirrorOptions.mirrorOrganizations
			? await fetchOrganizationRepositories(
				octokit,
				mirrorOptions.includeOrgs,
				mirrorOptions.excludeOrgs,
				mirrorOptions.preserveOrgStructure,
				{
					username: mirrorOptions.useSpecificUser ? mirrorOptions.username : undefined,
					privateRepositories: mirrorOptions.privateRepositories,
					isMemberOrgs: true // Flag to indicate these are member organizations
				}
			)
			: [];

		// Fetch public organization repos if the option is enabled
		const publicOrgRepos = mirrorOptions.mirrorPublicOrgs
			? await fetchPublicOrganizationRepositories(
				octokit,
				mirrorOptions.publicOrgs,
				mirrorOptions.preserveOrgStructure
			)
			: [];

		// If only mirroring organization repositories, skip personal repositories
		if (mirrorOptions.onlyMirrorOrgs) {
			console.log("Only mirroring organization repositories");
			repositories = filterDuplicates([...orgRepos, ...publicOrgRepos]);
		} else {
			// Standard mirroring logic for personal repositories
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

			// Combine all repositories and filter duplicates
			repositories = filterDuplicates([
				...publicRepositories,
				...privateRepos,
				...starredRepos,
				...orgRepos,
				...publicOrgRepos
			]);
		}
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
			.then(repos => toRepositoryList(repos.map(repo => ({...repo, starred: true}))));
	}

	// Default: Get starred repos for the authenticated user (what was previously used)
	return octokit
		.paginate("GET /user/starred")
		.then(repos => toRepositoryList(repos.map(repo => ({...repo, starred: true}))));
}

async function fetchOrganizationRepositories(octokit, includeOrgs = [], excludeOrgs = [], _preserveOrgStructure = false, options = {}) {
	try {
		// Get all organizations the user belongs to
		let allOrgs;

		// Try multiple approaches to fetch organizations
		try {
			// First try the authenticated user endpoint
			if (octokit.auth) {
				console.log("Using authenticated user endpoint to fetch organizations");
				try {
					// Make a direct API call first to see the raw response
					const response = await octokit.request('GET /user/orgs');
					console.log(`Direct API call response status: ${response.status}`);
					console.log(`Direct API call found ${response.data.length} organizations`);

					// Now use pagination to get all results
					allOrgs = await octokit.paginate("GET /user/orgs");
					console.log(`Paginated API call found ${allOrgs.length} organizations`);
				} catch (authError) {
					console.error(`Error using authenticated endpoint: ${authError.message}`);
					console.log("Falling back to public endpoint");
					allOrgs = [];
				}
			}

			// If authenticated call failed or returned no orgs, try the public endpoint
			if ((!allOrgs || allOrgs.length === 0) && options.username) {
				console.log(`Using public endpoint to fetch organizations for user: ${options.username}`);
				try {
					// Make a direct API call first to see the raw response
					const response = await octokit.request('GET /users/{username}/orgs', {
						username: options.username,
						headers: {
							'X-GitHub-Api-Version': '2022-11-28'
						}
					});
					console.log(`Direct public API call response status: ${response.status}`);
					console.log(`Direct public API call found ${response.data.length} organizations`);

					// Now use pagination to get all results
					allOrgs = await octokit.paginate("GET /users/{username}/orgs", {
						username: options.username,
						headers: {
							'X-GitHub-Api-Version': '2022-11-28'
						}
					});
				} catch (publicError) {
					console.error(`Error using public endpoint: ${publicError.message}`);
					allOrgs = [];
				}
			}

			// If we still have no orgs, try a direct API call to list specific orgs
			if (!allOrgs || allOrgs.length === 0) {
				console.log("No organizations found through standard endpoints. Trying direct API calls to specific organizations.");
				allOrgs = [];

				// Only check organizations explicitly specified in includeOrgs
				if (includeOrgs.length === 0) {
					console.log("No organizations specified in INCLUDE_ORGS. Skipping direct organization checks.");
					// Don't return early, as we might have found organizations through other methods
					// Instead, use the organizations we've already found
					if (allOrgs && allOrgs.length > 0) {
						console.log(`Using ${allOrgs.length} organizations found through public endpoint`);
						return await fetchReposFromOrgs(octokit, allOrgs, options);
					} else {
						// If no organizations found, try some common organizations
						const defaultOrgs = ['community-scripts', 'Proxmox'];
						console.log(`No organizations found. Trying default organizations: ${defaultOrgs.join(', ')}`);

						// Try each default organization
						for (const orgName of defaultOrgs) {
							try {
								const response = await octokit.request('GET /orgs/{org}', {
									org: orgName,
									headers: {
										'X-GitHub-Api-Version': '2022-11-28'
									}
								});

								console.log(`Successfully found default organization: ${orgName}`);
								allOrgs.push(response.data);
							} catch (orgError) {
								console.log(`Could not find default organization: ${orgName} - ${orgError.message}`);
							}
						}

						// If we found any default organizations, process them
						if (allOrgs.length > 0) {
							console.log(`Found ${allOrgs.length} default organizations`);
							return await fetchReposFromOrgs(octokit, allOrgs, options);
						} else {
							return [];
						}
					}
				}

				for (const orgName of includeOrgs) {
					try {
						const response = await octokit.request('GET /orgs/{org}', {
							org: orgName,
							headers: {
								'X-GitHub-Api-Version': '2022-11-28'
							}
						});

						console.log(`Successfully found organization: ${orgName}`);
						allOrgs.push(response.data);
					} catch (orgError) {
						if (orgError.message.includes('organization forbids access via a fine-grained personal access tokens if the token\'s lifetime is greater than 366 days')) {
							console.error(`\n\nERROR: The '${orgName}' organization has a policy that forbids access via fine-grained personal access tokens with a lifetime greater than 366 days.\n\nPlease adjust your token's lifetime or create a new token with a shorter lifetime.\nSee the error message for details: ${orgError.message}\n`);
						} else {
							console.log(`Could not find organization: ${orgName} - ${orgError.message}`);
						}
					}
				}
			}
		} catch (error) {
			console.error(`Error fetching organizations: ${error.message}`);
			allOrgs = [];
		}

		// Log the organizations found
		console.log(`Found ${allOrgs.length} organizations: ${allOrgs.map(org => org.login).join(', ')}`);

		// Filter organizations based on include/exclude lists
		let orgsToProcess = allOrgs;

		if (includeOrgs.length > 0) {
			// Only include specific organizations
			console.log(`Filtering to include only these organizations: ${includeOrgs.join(', ')}`);
			// Make case-insensitive comparison
			orgsToProcess = orgsToProcess.filter(org =>
				includeOrgs.some(includedOrg => includedOrg.toLowerCase() === org.login.toLowerCase())
			);
		}

		if (excludeOrgs.length > 0) {
			// Exclude specific organizations
			console.log(`Excluding these organizations: ${excludeOrgs.join(', ')}`);
			// Make case-insensitive comparison
			orgsToProcess = orgsToProcess.filter(org =>
				!excludeOrgs.some(excludedOrg => excludedOrg.toLowerCase() === org.login.toLowerCase())
			);
		}

		console.log(`Processing repositories from ${orgsToProcess.length} organizations: ${orgsToProcess.map(org => org.login).join(', ')}`);

		// If no organizations to process, return early
		if (orgsToProcess.length === 0) {
			console.log("No organizations to process after filtering. Check your INCLUDE_ORGS and EXCLUDE_ORGS settings.");
			return [];
		}

		// Process each organization using the extracted function
		return await fetchReposFromOrgs(octokit, orgsToProcess, options);
	} catch (error) {
		console.error("Error fetching organization repositories:", error.message);
		return [];
	}
}

// Extract repository fetching logic into a separate function
async function fetchReposFromOrgs(octokit, orgs, options = {}) {
	const allOrgRepos = [];
	const privateRepoAccess = options.privateRepositories && octokit.auth;

	// Process each organization
	for (const org of orgs) {
		const orgName = org.login;
		console.log(`Fetching repositories for organization: ${orgName}`);

		try {
			let orgRepos = [];

			// Use search API for organizations when private repositories are requested
			// This is based on the GitHub community discussion recommendation
			if (privateRepoAccess) {
					console.log(`Using search API to fetch both public and private repositories for org: ${orgName}`);
					// Query for both public and private repositories in the organization
					const searchQuery = `org:${orgName}`;

					try {
						// Make a direct API call first to see the raw response
						const directResponse = await octokit.request('GET /search/repositories', {
							q: searchQuery,
							per_page: 100
						});
						console.log(`Direct search API call response status: ${directResponse.status}`);
						console.log(`Direct search API call found ${directResponse.data.items?.length || 0} repositories`);

						// Now use pagination to get all results
						const searchResults = await octokit.paginate("GET /search/repositories", {
							q: searchQuery,
							per_page: 100
						});

						// Search API returns repositories in the 'items' array
						orgRepos = searchResults.flatMap(result => result.items || []);
						console.log(`Found ${orgRepos.length} repositories (public and private) for org: ${orgName}`);

						// If no repositories found, try the standard API as a fallback
						if (orgRepos.length === 0) {
							console.log(`No repositories found using search API for org: ${orgName}. Trying standard API...`);
							orgRepos = await octokit.paginate("GET /orgs/{org}/repos", {
								org: orgName
							});
							console.log(`Found ${orgRepos.length} repositories using standard API for org: ${orgName}`);
						}
					} catch (searchError) {
						console.error(`Error using search API for org ${orgName}: ${searchError.message}`);
						console.log(`Falling back to standard API for org: ${orgName}`);

						// Use standard API as fallback
						orgRepos = await octokit.paginate("GET /orgs/{org}/repos", {
							org: orgName
						});
						console.log(`Found ${orgRepos.length} repositories using standard API for org: ${orgName}`);
					}
				} else {
					// Use standard API for public repositories only
					try {
						// Make a direct API call first to see the raw response
						const directResponse = await octokit.request('GET /orgs/{org}/repos', {
							org: orgName
						});
						console.log(`Direct standard API call response status: ${directResponse.status}`);
						console.log(`Direct standard API call found ${directResponse.data.length} repositories`);

						// Now use pagination to get all results
						orgRepos = await octokit.paginate("GET /orgs/{org}/repos", {
							org: orgName
						});
						console.log(`Found ${orgRepos.length} public repositories for org: ${orgName}`);
					} catch (standardError) {
						console.error(`Error using standard API for org ${orgName}: ${standardError.message}`);
						orgRepos = [];
					}
				}

				// If we still have no repositories, try a direct API call to the GitHub API
				if (orgRepos.length === 0) {
					console.log(`No repositories found for org: ${orgName}. Trying direct API call...`);
					try {
						// Try to directly fetch repositories using the REST API
						const response = await octokit.rest.repos.listForOrg({
							org: orgName,
							type: 'all',
							per_page: 100
						});

						orgRepos = response.data;
						console.log(`Found ${orgRepos.length} repositories using REST API for org: ${orgName}`);

						// If we still have no repositories, try one more approach with the public repos endpoint
						if (orgRepos.length === 0) {
							console.log(`Still no repositories found. Trying public repos endpoint for org: ${orgName}...`);
							try {
								// Try the public repos endpoint which might have different access controls
								const publicResponse = await octokit.request('GET /orgs/{org}/repos', {
									org: orgName,
									type: 'public',
									per_page: 100,
									headers: {
										'X-GitHub-Api-Version': '2022-11-28'
									}
								});
								orgRepos = publicResponse.data;
								console.log(`Found ${orgRepos.length} public repositories using public endpoint for org: ${orgName}`);
							} catch (publicError) {
								console.error(`Error using public repos endpoint for org ${orgName}: ${publicError.message}`);
							}
						}

						// If we still have no repositories, check if the user has access to the organization
						if (orgRepos.length === 0) {
							console.log(`Still no repositories found for org: ${orgName}. Checking membership...`);
							try {
								// Check if the authenticated user is a member of the organization
								const membershipResponse = await octokit.rest.orgs.getMembershipForAuthenticatedUser({
									org: orgName
								});

								console.log(`User membership in ${orgName}: ${membershipResponse.data.role} (${membershipResponse.data.state})`);

								if (membershipResponse.data.state !== 'active') {
									console.error(`Your membership in ${orgName} is not active. Please check your organization membership.`);
								} else {
									console.error(`You are an active member of ${orgName} but no repositories were found. This could be due to permission restrictions.`);

									// Check if the organization has any repositories at all
									try {
										const orgResponse = await octokit.rest.orgs.get({
											org: orgName
										});

										console.log(`Organization ${orgName} has ${orgResponse.data.public_repos} public repositories`);

										if (orgResponse.data.public_repos === 0) {
											console.log(`Organization ${orgName} has no public repositories.`);
										}
									} catch (orgError) {
										console.error(`Error fetching organization details for ${orgName}: ${orgError.message}`);
									}
								}
							} catch (membershipError) {
								console.error(`Error checking membership for org ${orgName}: ${membershipError.message}`);
								console.error(`You might not have access to the repositories in ${orgName}. Please check your permissions.`);
							}
						}
					} catch (directError) {
						console.error(`Error using REST API for org ${orgName}: ${directError.message}`);
					}
				}

				// Add organization context to each repository
				// Always add the organization property, but it will only be used for mirroring
				// if preserveOrgStructure is enabled
				orgRepos = orgRepos.map(repo => ({
					...repo,
					organization: orgName
				}));

				allOrgRepos.push(...orgRepos);
			} catch (orgError) {
				console.error(`Error fetching repositories for org ${orgName}:`, orgError.message);
			}
		}

		// Convert to repository list format
		return toRepositoryList(allOrgRepos);
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

/**
 * Fetch repositories from public organizations that the user may not be a member of
 * This is a separate function from fetchOrganizationRepositories to handle public orgs differently
 */
async function fetchPublicOrganizationRepositories(octokit, publicOrgs = [], _preserveOrgStructure = false) {
	try {
		console.log("Fetching public organization repositories...");
		if (publicOrgs.length === 0) {
			console.log("No public organizations specified. Use PUBLIC_ORGS environment variable to specify organizations.");
			return [];
		}

		console.log(`Attempting to fetch repositories from these public organizations: ${publicOrgs.join(', ')}`);
		const allOrgRepos = [];

		// Process each organization directly - we don't need to check membership
		for (const orgName of publicOrgs) {
			console.log(`Fetching repositories for public organization: ${orgName}`);

			try {
				// Try to get organization info first to verify it exists
				try {
					await octokit.request('GET /orgs/{org}', {
						org: orgName,
						headers: {
							'X-GitHub-Api-Version': '2022-11-28'
						}
					});
					console.log(`Successfully found public organization: ${orgName}`);
				} catch (orgError) {
					console.error(`Error fetching public organization ${orgName}: ${orgError.message}`);
					continue; // Skip to next organization
				}

				// Fetch public repositories for this organization
				let orgRepos = [];
				try {
					// Make a direct API call first to see the raw response
					const directResponse = await octokit.request('GET /orgs/{org}/repos', {
						org: orgName,
						type: 'public', // Only fetch public repos
						per_page: 100
					});
					console.log(`Direct API call response status: ${directResponse.status}`);
					console.log(`Direct API call found ${directResponse.data.length} repositories`);

					// Now use pagination to get all results
					orgRepos = await octokit.paginate("GET /orgs/{org}/repos", {
						org: orgName,
						type: 'public', // Only fetch public repos
						per_page: 100
					});
					console.log(`Found ${orgRepos.length} public repositories for org: ${orgName}`);
				} catch (repoError) {
					console.error(`Error fetching repositories for public organization ${orgName}: ${repoError.message}`);

					// Try another approach using the REST API
					console.log(`Trying REST API for public organization: ${orgName}...`);
					try {
						const restResponse = await octokit.rest.repos.listForOrg({
							org: orgName,
							type: 'public',
							per_page: 100
						});
						orgRepos = restResponse.data;
						console.log(`Found ${orgRepos.length} public repositories using REST API for org: ${orgName}`);
					} catch (restError) {
						console.error(`Error using REST API for public organization ${orgName}: ${restError.message}`);
						continue; // Skip to next organization
					}
				}

				// Add organization context to each repository
				orgRepos = orgRepos.map(repo => ({
					...repo,
					organization: orgName
				}));

				allOrgRepos.push(...orgRepos);
			} catch (error) {
				console.error(`Error processing public organization ${orgName}:`, error.message);
			}
		}

		console.log(`Found a total of ${allOrgRepos.length} repositories from public organizations`);
		return toRepositoryList(allOrgRepos);
	} catch (error) {
		console.error("Error fetching public organization repositories:", error.message);
		return [];
	}
}

function toRepositoryList(repositories) {
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

		// Add organization context if it exists
		// Always include the organization property if it exists
		if (repository.organization) {
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
