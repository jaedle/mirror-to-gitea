import { Octokit } from "@octokit/rest";
import { minimatch } from "minimatch";
import PQueue from "p-queue";
import request from "superagent";
import { configuration } from "./configuration.mjs";
import { Logger } from "./logger.js";
import getGithubRepositories from "./get-github-repositories.mjs";

async function getGithubRepositories(
	username,
	token,
	mirrorPrivateRepositories,
	mirrorForks,
	mirrorStarred,
	mirrorOrganizations,
	include,
	exclude,
) {
	const octokit = new Octokit({
		auth: token || null,
	});

	const repositories = await getGithubRepositories(octokit, {
		username,
		privateRepositories: mirrorPrivateRepositories,
		skipForks: !mirrorForks,
		mirrorStarred,
		mirrorOrganizations,
	});

	return repositories.filter(
		(repository) =>
			include.some((f) => minimatch(repository.name, f)) &&
			!exclude.some((f) => minimatch(repository.name, f)),
	);
}

// Fetch issues for a given repository
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

async function getGiteaUser(gitea) {
	return request
		.get(`${gitea.url}/api/v1/user`)
		.set("Authorization", `token ${gitea.token}`)
		.then((response) => {
			return { id: response.body.id, name: response.body.username };
		});
}

function isAlreadyMirroredOnGitea(repository, gitea, giteaUser) {
	const repoName = repository.name;
	const ownerName = giteaUser.name;
	const requestUrl = `${gitea.url}/api/v1/repos/${ownerName}/${repoName}`;
	
	return request
		.get(requestUrl)
		.set("Authorization", `token ${gitea.token}`)
		.then(() => true)
		.catch(() => false);
}

function mirrorOnGitea(repository, gitea, giteaUser, githubToken) {
	return request
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
		.then((response) => {
			console.log(`Successfully mirrored: ${repository.name}`);
			return response.body;
		})
		.catch((err) => {
			console.log(`Failed to mirror ${repository.name}:`, err.message);
			throw err;
		});
}

// Create an issue in a Gitea repository
async function createGiteaIssue(issue, repository, gitea, giteaUser) {
	try {
		const response = await request
			.post(`${gitea.url}/api/v1/repos/${giteaUser.name}/${repository.name}/issues`)
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
						.post(`${gitea.url}/api/v1/repos/${giteaUser.name}/${repository.name}/labels`)
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
						.post(`${gitea.url}/api/v1/repos/${giteaUser.name}/${repository.name}/issues/${response.body.number}/labels`)
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

async function mirrorIssues(repository, gitea, giteaUser, githubToken, dryRun) {
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
			await createGiteaIssue(issue, repository, gitea, giteaUser);
		}
		
		console.log(`Completed mirroring issues for ${repository.name}`);
	} catch (error) {
		console.error(`Error mirroring issues for ${repository.name}:`, error.message);
	}
}

async function mirror(repository, gitea, giteaUser, githubToken, mirrorIssues, dryRun) {
	if (await isAlreadyMirroredOnGitea(repository, gitea, giteaUser)) {
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
	try {
		await mirrorOnGitea(repository, gitea, giteaUser, githubToken);
		
		// Mirror issues if requested and not in dry run mode
		if (mirrorIssues && !dryRun) {
			await mirrorIssues(repository, gitea, giteaUser, githubToken, dryRun);
		}
	} catch (error) {
		console.error(`Error during mirroring of ${repository.name}:`, error.message);
	}
}

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

	const githubRepositories = await getGithubRepositories(
		config.github.username,
		config.github.token,
		config.github.privateRepositories,
		!config.github.skipForks,
		config.github.mirrorStarred,
		config.github.mirrorOrganizations,
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
					config.github.mirrorIssues,
					config.dryRun,
				);
			};
		}),
	);
}

main();
