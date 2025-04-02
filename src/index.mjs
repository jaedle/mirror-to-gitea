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
		singleRepo: config.github.singleRepo,
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

	// Get Gitea user or organization ID
	const giteaTarget = config.gitea.organization 
		? await getGiteaOrganization(gitea, config.gitea.organization)
		: await getGiteaUser(gitea);

	if (!giteaTarget) {
		console.error("Failed to get Gitea user or organization. Exiting.");
		process.exit(1);
	}

	// Mirror repositories
	const queue = new PQueue({ concurrency: 4 });
	await queue.addAll(
		filteredRepositories.map((repository) => {
			return async () => {
				await mirror(
					repository,
					gitea,
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
			const existingOrg = await request
				.get(`${gitea.url}/api/v1/orgs/${orgName}`)
				.set("Authorization", `token ${gitea.token}`);
			
			console.log(`Organization ${orgName} already exists`);
			return true;
		} catch (checkError) {
			// Organization doesn't exist, continue to create it
		}

		const response = await request
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
	if (await isAlreadyMirroredOnGitea(repository, gitea, giteaTarget)) {
		console.log(
			`Repository ${repository.name} is already mirrored; doing nothing.`
		);
		return;
	}
	
	if (dryRun) {
		console.log(`DRY RUN: Would mirror repository to gitea: ${repository.name}`);
		return;
	}
	
	console.log(`Mirroring repository to gitea: ${repository.name}`);
	try {
		await mirrorOnGitea(repository, gitea, giteaTarget, githubToken);
		
		// Mirror issues if requested and not in dry run mode
		if (mirrorIssuesFlag && !dryRun) {
			await mirrorIssues(repository, gitea, giteaTarget, githubToken, dryRun);
		}
	} catch (error) {
		console.error(`Error during mirroring of ${repository.name}:`, error.message);
	}
}

main().catch(error => {
	console.error("Application error:", error);
	process.exit(1);
});
