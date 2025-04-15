import { Octokit } from "@octokit/rest";
import { minimatch } from "minimatch";
import PQueue from "p-queue";
import request from "superagent";
import { configuration } from "./configuration.mjs";
import { Logger } from "./logger.js";
import getGithubRepositories from "./get-github-repositories.mjs";

async function main() {
	let config;
	try {
		config = configuration();
	} catch (e) {
		console.error("invalid configuration", e);
		process.exit(1);
	}

	const logger = new Logger();
	logger.showConfig(config);

	// Create Gitea organization if specified
	if (config.gitea.organization) {
		await createGiteaOrganization(
			{
				url: config.gitea.url,
				token: config.gitea.token,
			},
			config.gitea.organization,
			config.gitea.visibility,
			config.dryRun
		);
	}

	// Create the starred repositories organization if mirror starred is enabled
	if (config.github.mirrorStarred && config.gitea.starredReposOrg) {
		await createGiteaOrganization(
			{
				url: config.gitea.url,
				token: config.gitea.token,
			},
			config.gitea.starredReposOrg,
			config.gitea.visibility,
			config.dryRun
		);
	}

	const octokit = new Octokit({
		auth: config.github.token || null,
	});

	// Get user or organization repositories
	const githubRepositories = await getGithubRepositories(octokit, {
		username: config.github.username,
		privateRepositories: config.github.privateRepositories,
		skipForks: config.github.skipForks,
		mirrorStarred: config.github.mirrorStarred,
		mirrorOrganizations: config.github.mirrorOrganizations,
		onlyMirrorOrgs: config.github.onlyMirrorOrgs,
		singleRepo: config.github.singleRepo,
		includeOrgs: config.github.includeOrgs,
		excludeOrgs: config.github.excludeOrgs,
		// New options for public organizations
		mirrorPublicOrgs: config.github.mirrorPublicOrgs,
		publicOrgs: config.github.publicOrgs,
		preserveOrgStructure: config.github.preserveOrgStructure,
	});

	// Apply include/exclude filters
	const filteredRepositories = githubRepositories.filter(
		(repository) =>
			config.include.some((f) => minimatch(repository.name, f)) &&
			!config.exclude.some((f) => minimatch(repository.name, f)),
	);

	console.log(`Found ${filteredRepositories.length} repositories to mirror`);

	const gitea = {
		url: config.gitea.url,
		token: config.gitea.token,
	};

	// Get Gitea user information
	const giteaUser = await getGiteaUser(gitea);
	if (!giteaUser) {
		console.error("Failed to get Gitea user. Exiting.");
		process.exit(1);
	}

	// Create a map to store organization targets
	const orgTargets = new Map();

	// If mirroring organizations is enabled, create Gitea organizations for all GitHub orgs the user belongs to
	if (config.github.mirrorOrganizations || config.github.mirrorPublicOrgs) {
		console.log("Fetching GitHub organizations for mirroring...");
		// Fetch all organizations the user belongs to
		let userOrgs = [];
		try {
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
						userOrgs = await octokit.paginate("GET /user/orgs");
						console.log(`Paginated API call found ${userOrgs.length} organizations`);
					} catch (authError) {
						console.error(`Error using authenticated endpoint: ${authError.message}`);
						console.log("Falling back to public endpoint");
						userOrgs = [];
					}
				}

				// If authenticated call failed or returned no orgs, try the public endpoint
				if ((!userOrgs || userOrgs.length === 0) && config.github.username) {
					console.log(`Using public endpoint to fetch organizations for user: ${config.github.username}`);
					try {
						// Make a direct API call first to see the raw response
						const response = await octokit.request('GET /users/{username}/orgs', {
							username: config.github.username,
							headers: {
								'X-GitHub-Api-Version': '2022-11-28'
							}
						});
						console.log(`Direct public API call response status: ${response.status}`);
						console.log(`Direct public API call found ${response.data.length} organizations`);

						// Now use pagination to get all results
						userOrgs = await octokit.paginate("GET /users/{username}/orgs", {
							username: config.github.username,
							headers: {
								'X-GitHub-Api-Version': '2022-11-28'
							}
						});
					} catch (publicError) {
						console.error(`Error using public endpoint: ${publicError.message}`);
						userOrgs = [];
					}
				}

				// If we still have no orgs, try a direct API call to list specific orgs
				if (!userOrgs || userOrgs.length === 0) {
					console.log("No organizations found through standard endpoints. Trying direct API calls to specific organizations.");
					userOrgs = [];

					// Only check organizations explicitly specified in includeOrgs
					if (config.github.includeOrgs.length === 0) {
						console.log("No organizations specified in INCLUDE_ORGS. Skipping direct organization checks.");
						// Don't return here, as it would prevent the rest of the function from executing
						// Just continue with an empty userOrgs array
						userOrgs = [];
					} else {
						for (const orgName of config.github.includeOrgs) {
							try {
								const response = await octokit.request('GET /orgs/{org}', {
									org: orgName,
									headers: {
										'X-GitHub-Api-Version': '2022-11-28'
									}
								});

								console.log(`Successfully found organization: ${orgName}`);
								userOrgs.push(response.data);
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
				userOrgs = [];
			}

			// Log the organizations found
			console.log(`Found ${userOrgs.length} organizations: ${userOrgs.map(org => org.login).join(', ')}`);

			// Filter organizations based on include/exclude lists
			if (config.github.includeOrgs.length > 0) {
				console.log(`Filtering to include only these organizations: ${config.github.includeOrgs.join(', ')}`);
				// Make case-insensitive comparison
				userOrgs = userOrgs.filter(org =>
					config.github.includeOrgs.some(includedOrg => includedOrg.toLowerCase() === org.login.toLowerCase())
				);
			}

			if (config.github.excludeOrgs.length > 0) {
				console.log(`Excluding these organizations: ${config.github.excludeOrgs.join(', ')}`);
				// Make case-insensitive comparison
				userOrgs = userOrgs.filter(org =>
					!config.github.excludeOrgs.some(excludedOrg => excludedOrg.toLowerCase() === org.login.toLowerCase())
				);
			}

			console.log(`Found ${userOrgs.length} GitHub organizations to mirror: ${userOrgs.map(org => org.login).join(', ')}`);

			// If no organizations to process, log a warning
			if (userOrgs.length === 0) {
				console.log("No organizations to mirror after filtering. Check your INCLUDE_ORGS and EXCLUDE_ORGS settings.");
			}

			// Create each organization in Gitea
			for (const org of userOrgs) {
				const orgName = org.login;
				console.log(`Preparing Gitea organization for GitHub organization: ${orgName}`);

				// Create the organization if it doesn't exist
				await createGiteaOrganization(
					gitea,
					orgName,
					config.gitea.visibility,
					config.dryRun
				);

				// Get the organization details
				const orgTarget = await getGiteaOrganization(gitea, orgName);
				if (orgTarget) {
					orgTargets.set(orgName, orgTarget);
				} else {
					console.error(`Failed to get or create Gitea organization: ${orgName}`);
				}
			}

			// Handle public organizations if enabled
			if (config.github.mirrorPublicOrgs && config.github.publicOrgs.length > 0) {
				console.log("Processing public organizations...");
				for (const orgName of config.github.publicOrgs) {
					console.log(`Preparing Gitea organization for public GitHub organization: ${orgName}`);

					// Create the organization if it doesn't exist
					await createGiteaOrganization(
						gitea,
						orgName,
						config.gitea.visibility,
						config.dryRun
					);

					// Get the organization details
					const orgTarget = await getGiteaOrganization(gitea, orgName);
					if (orgTarget) {
						orgTargets.set(orgName, orgTarget);
					} else {
						console.error(`Failed to get or create Gitea organization: ${orgName}`);
					}
				}
			}
		} catch (error) {
			console.error("Error fetching user organizations:", error.message);
		}
	}

	// If preserving org structure, ensure all organizations from repositories are created
	if (config.github.preserveOrgStructure) {
		// Get unique organization names from repositories
		const uniqueOrgs = new Set(
			filteredRepositories
				.filter(repo => repo.organization)
				.map(repo => repo.organization)
		);

		// Create or get each organization in Gitea if not already created
		for (const orgName of uniqueOrgs) {
			if (!orgTargets.has(orgName)) {
				console.log(`Preparing Gitea organization for GitHub organization: ${orgName}`);

				// Create the organization if it doesn't exist
				await createGiteaOrganization(
					gitea,
					orgName,
					config.gitea.visibility,
					config.dryRun
				);

				// Get the organization details
				const orgTarget = await getGiteaOrganization(gitea, orgName);
				if (orgTarget) {
					orgTargets.set(orgName, orgTarget);
				} else {
					console.error(`Failed to get or create Gitea organization: ${orgName}`);
				}
			}
		}
	}

	// Mirror repositories
	const queue = new PQueue({ concurrency: 4 });
	await queue.addAll(
		filteredRepositories.map((repository) => {
			return async () => {
				// Determine the target (user or organization)
				let giteaTarget;

				if (config.github.preserveOrgStructure && repository.organization) {
					// Use the organization as target
					giteaTarget = orgTargets.get(repository.organization);
					if (!giteaTarget) {
						console.error(`No Gitea organization found for ${repository.organization}, using user instead`);
						giteaTarget = config.gitea.organization
							? await getGiteaOrganization(gitea, config.gitea.organization)
							: giteaUser;
					}
				} else {
					// Use the specified organization or user
					giteaTarget = config.gitea.organization
						? await getGiteaOrganization(gitea, config.gitea.organization)
						: giteaUser;
				}

				await mirror(
					repository,
					{
						url: config.gitea.url,
						token: config.gitea.token,
						skipStarredIssues: config.github.skipStarredIssues,
						starredReposOrg: config.gitea.starredReposOrg
					},
					giteaTarget,
					config.github.token,
					config.github.mirrorIssues,
					config.dryRun,
				);
			};
		}),
	);
}

// Get Gitea user information
async function getGiteaUser(gitea) {
	try {
		const response = await request
			.get(`${gitea.url}/api/v1/user`)
			.set("Authorization", `token ${gitea.token}`);

		return {
			id: response.body.id,
			name: response.body.username,
			type: "user"
		};
	} catch (error) {
		console.error("Error fetching Gitea user:", error.message);
		return null;
	}
}

// Get Gitea organization information
async function getGiteaOrganization(gitea, orgName) {
	try {
		const response = await request
			.get(`${gitea.url}/api/v1/orgs/${orgName}`)
			.set("Authorization", `token ${gitea.token}`);

		return {
			id: response.body.id,
			name: orgName,
			type: "organization"
		};
	} catch (error) {
		console.error(`Error fetching Gitea organization ${orgName}:`, error.message);
		return null;
	}
}

// Create a Gitea organization
async function createGiteaOrganization(gitea, orgName, visibility, dryRun) {
	if (dryRun) {
		console.log(`DRY RUN: Would create Gitea organization: ${orgName} (${visibility})`);
		return true;
	}

	try {
		// First check if organization already exists
		try {
			await request
				.get(`${gitea.url}/api/v1/orgs/${orgName}`)
				.set("Authorization", `token ${gitea.token}`);

			console.log(`Organization ${orgName} already exists`);
			return true;
		} catch (checkError) {
			// Organization doesn't exist, continue to create it
		}

		await request
			.post(`${gitea.url}/api/v1/orgs`)
			.set("Authorization", `token ${gitea.token}`)
			.send({
				username: orgName,
				visibility: visibility || "public",
			});

		console.log(`Created organization: ${orgName}`);
		return true;
	} catch (error) {
		// 422 error typically means the organization already exists
		if (error.status === 422) {
			console.log(`Organization ${orgName} already exists`);
			return true;
		}

		console.error(`Error creating Gitea organization ${orgName}:`, error.message);
		return false;
	}
}

// Check if repository is already mirrored
async function isAlreadyMirroredOnGitea(repository, gitea, giteaTarget) {
	const repoName = repository.name;
	const ownerName = giteaTarget.name;
	const requestUrl = `${gitea.url}/api/v1/repos/${ownerName}/${repoName}`;

	try {
		await request
			.get(requestUrl)
			.set("Authorization", `token ${gitea.token}`);
		return true;
	} catch (error) {
		return false;
	}
}

// Mirror repository to Gitea
async function mirrorOnGitea(repository, gitea, giteaTarget, githubToken) {
	try {
		const response = await request
			.post(`${gitea.url}/api/v1/repos/migrate`)
			.set("Authorization", `token ${gitea.token}`)
			.send({
				auth_token: githubToken || null,
				clone_addr: repository.url,
				mirror: true,
				repo_name: repository.name,
				uid: giteaTarget.id,
				private: repository.private,
			});

		console.log(`Successfully mirrored: ${repository.name}`);
		return response.body;
	} catch (error) {
		console.error(`Failed to mirror ${repository.name}:`, error.message);
		throw error;
	}
}

// Fetch issues for a repository
async function getGithubIssues(octokit, owner, repo) {
	try {
		const issues = await octokit.paginate("GET /repos/{owner}/{repo}/issues", {
			owner,
			repo,
			state: "all",
			per_page: 100,
		});

		return issues.map(issue => ({
			title: issue.title,
			body: issue.body || "",
			state: issue.state,
			labels: issue.labels.map(label => label.name),
			closed: issue.state === "closed",
			created_at: issue.created_at,
			updated_at: issue.updated_at,
			number: issue.number,
			user: issue.user.login,
		}));
	} catch (error) {
		console.error(`Error fetching issues for ${owner}/${repo}:`, error.message);
		return [];
	}
}

// Create an issue in a Gitea repository
async function createGiteaIssue(issue, repository, gitea, giteaTarget) {
	try {
		const response = await request
			.post(`${gitea.url}/api/v1/repos/${giteaTarget.name}/${repository.name}/issues`)
			.set("Authorization", `token ${gitea.token}`)
			.send({
				title: issue.title,
				body: `*Originally created by @${issue.user} on ${new Date(issue.created_at).toLocaleDateString()}*\n\n${issue.body}`,
				state: issue.state,
				closed: issue.closed,
			});

		console.log(`Created issue #${response.body.number}: ${issue.title}`);

		// Add labels if the issue has any
		if (issue.labels && issue.labels.length > 0) {
			await Promise.all(issue.labels.map(async (label) => {
				try {
					// First try to create the label if it doesn't exist
					await request
						.post(`${gitea.url}/api/v1/repos/${giteaTarget.name}/${repository.name}/labels`)
						.set("Authorization", `token ${gitea.token}`)
						.send({
							name: label,
							color: "#" + Math.floor(Math.random() * 16777215).toString(16), // Random color
						})
						.catch(() => {
							// Label might already exist, which is fine
						});

					// Then add the label to the issue
					await request
						.post(`${gitea.url}/api/v1/repos/${giteaTarget.name}/${repository.name}/issues/${response.body.number}/labels`)
						.set("Authorization", `token ${gitea.token}`)
						.send({
							labels: [label]
						});
				} catch (labelError) {
					console.error(`Error adding label ${label} to issue:`, labelError.message);
				}
			}));
		}

		return response.body;
	} catch (error) {
		console.error(`Error creating issue "${issue.title}":`, error.message);
		return null;
	}
}

// Mirror issues for a repository
async function mirrorIssues(repository, gitea, giteaTarget, githubToken, dryRun) {
	if (!repository.has_issues) {
		console.log(`Repository ${repository.name} doesn't have issues enabled. Skipping issues mirroring.`);
		return;
	}

	if (dryRun) {
		console.log(`DRY RUN: Would mirror issues for repository: ${repository.name}`);
		return;
	}

	try {
		const octokit = new Octokit({ auth: githubToken });
		const owner = repository.owner || repository.full_name.split('/')[0];
		const issues = await getGithubIssues(octokit, owner, repository.name);

		console.log(`Found ${issues.length} issues for ${repository.name}`);

		// Create issues one by one to maintain order
		for (const issue of issues) {
			await createGiteaIssue(issue, repository, gitea, giteaTarget);
		}

		console.log(`Completed mirroring issues for ${repository.name}`);
	} catch (error) {
		console.error(`Error mirroring issues for ${repository.name}:`, error.message);
	}
}

// Mirror a repository
async function mirror(repository, gitea, giteaTarget, githubToken, mirrorIssuesFlag, dryRun) {
	// For organization repositories, use the corresponding organization if available
	if (repository.organization) {
		const orgTarget = await getGiteaOrganization(gitea, repository.organization);
		if (orgTarget) {
			console.log(`Using organization "${repository.organization}" for repository: ${repository.name}`);
			giteaTarget = orgTarget;
		} else {
			console.log(`Could not find organization "${repository.organization}" for repository ${repository.name}, using default target`);
		}
	}
	// For starred repositories, use the starred repos organization if configured
	else if (repository.starred && gitea.starredReposOrg) {
		// Get the starred repos organization
		const starredOrg = await getGiteaOrganization(gitea, gitea.starredReposOrg);
		if (starredOrg) {
			console.log(`Using organization "${gitea.starredReposOrg}" for starred repository: ${repository.name}`);
			giteaTarget = starredOrg;
		} else {
			console.log(`Could not find organization "${gitea.starredReposOrg}" for starred repositories, using default target`);
		}
	}

	const isAlreadyMirrored = await isAlreadyMirroredOnGitea(repository, gitea, giteaTarget);

	// Special handling for starred repositories
	if (repository.starred) {
		if (isAlreadyMirrored) {
			console.log(`Repository ${repository.name} is already mirrored in ${giteaTarget.type} ${giteaTarget.name}; checking if it needs to be starred.`);
			await starRepositoryInGitea(repository, gitea, giteaTarget, dryRun);
			return;
		} else if (dryRun) {
			console.log(`DRY RUN: Would mirror and star repository to ${giteaTarget.type} ${giteaTarget.name}: ${repository.name} (starred)`);
			return;
		}
	} else if (isAlreadyMirrored) {
		console.log(`Repository ${repository.name} is already mirrored in ${giteaTarget.type} ${giteaTarget.name}; doing nothing.`);
		return;
	} else if (dryRun) {
		console.log(`DRY RUN: Would mirror repository to ${giteaTarget.type} ${giteaTarget.name}: ${repository.name}`);
		return;
	}

	console.log(`Mirroring repository to ${giteaTarget.type} ${giteaTarget.name}: ${repository.name}${repository.starred ? ' (will be starred)' : ''}`);
	try {
		await mirrorOnGitea(repository, gitea, giteaTarget, githubToken);

		// Star the repository if it's marked as starred
		if (repository.starred) {
			await starRepositoryInGitea(repository, gitea, giteaTarget, dryRun);
		}

		// Mirror issues if requested and not in dry run mode
		// Skip issues for starred repos if the skipStarredIssues option is enabled
		const shouldMirrorIssues = mirrorIssuesFlag &&
			!(repository.starred && gitea.skipStarredIssues);

		if (shouldMirrorIssues && !dryRun) {
			await mirrorIssues(repository, gitea, giteaTarget, githubToken, dryRun);
		} else if (repository.starred && gitea.skipStarredIssues) {
			console.log(`Skipping issues for starred repository: ${repository.name}`);
		}
	} catch (error) {
		console.error(`Error during mirroring of ${repository.name}:`, error.message);
	}
}

// Star a repository in Gitea
async function starRepositoryInGitea(repository, gitea, giteaTarget, dryRun) {
	const ownerName = giteaTarget.name;
	const repoName = repository.name;

	if (dryRun) {
		console.log(`DRY RUN: Would star repository in Gitea: ${ownerName}/${repoName}`);
		return true;
	}

	try {
		await request
			.put(`${gitea.url}/api/v1/user/starred/${ownerName}/${repoName}`)
			.set("Authorization", `token ${gitea.token}`);

		console.log(`Successfully starred repository in Gitea: ${ownerName}/${repoName}`);
		return true;
	} catch (error) {
		console.error(`Error starring repository ${ownerName}/${repoName}:`, error.message);
		return false;
	}
}

main().catch(error => {
	console.error("Application error:", error);
	process.exit(1);
});
