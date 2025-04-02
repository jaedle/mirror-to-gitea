const readEnv = (variable) => {
	const val = process.env[variable];
	if (val === undefined || val.length === 0) return undefined;
	return val;
};

const mustReadEnv = (variable) => {
	const val = process.env[variable];
	if (val === undefined || val.length === 0) {
		throw new Error(`invalid configuration, please provide ${variable}`);
	}

	return val;
};

function readBoolean(variable) {
	return process.env[variable] === "true" || process.env[variable] === "1";
}

function readInt(variable) {
	if (process.env[variable] === undefined) {
		return undefined;
	}

	return Number.parseInt(process.env[variable]);
}

export function configuration() {
	const defaultDelay = 3600;
	const defaultInclude = "*";
	const defaultExclude = "";
	const config = {
		github: {
			username: mustReadEnv("GITHUB_USERNAME"),
			token: process.env.GITHUB_TOKEN,
			skipForks: readBoolean("SKIP_FORKS"),
			privateRepositories: readBoolean("MIRROR_PRIVATE_REPOSITORIES"),
			mirrorIssues: readBoolean("MIRROR_ISSUES"),
			mirrorStarred: readBoolean("MIRROR_STARRED"),
			mirrorOrganizations: readBoolean("MIRROR_ORGANIZATIONS"),
			useSpecificUser: readBoolean("USE_SPECIFIC_USER"),
			singleRepo: readEnv("SINGLE_REPO"),
			includeOrgs: (readEnv("INCLUDE_ORGS") || "")
				.split(",")
				.map((o) => o.trim())
				.filter((o) => o.length > 0),
			excludeOrgs: (readEnv("EXCLUDE_ORGS") || "")
				.split(",")
				.map((o) => o.trim())
				.filter((o) => o.length > 0),
			preserveOrgStructure: readBoolean("PRESERVE_ORG_STRUCTURE"),
			skipStarredIssues: readBoolean("SKIP_STARRED_ISSUES"),
		},
		gitea: {
			url: mustReadEnv("GITEA_URL"),
			token: mustReadEnv("GITEA_TOKEN"),
			organization: readEnv("GITEA_ORGANIZATION"),
			visibility: readEnv("GITEA_ORG_VISIBILITY") || "public",
			starredReposOrg: readEnv("GITEA_STARRED_ORGANIZATION") || "github",
		},
		dryRun: readBoolean("DRY_RUN"),
		delay: readInt("DELAY") ?? defaultDelay,
		include: (readEnv("INCLUDE") ?? defaultInclude)
			.split(",")
			.map((f) => f.trim()),
		exclude: (readEnv("EXCLUDE") ?? defaultExclude)
			.split(",")
			.map((f) => f.trim()),
		singleRun: readBoolean("SINGLE_RUN"),
	};

	if (config.github.privateRepositories && config.github.token === undefined) {
		throw new Error(
			"invalid configuration, mirroring private repositories requires setting GITHUB_TOKEN",
		);
	}

	// GitHub token is required for mirroring issues, starred repos, and orgs
	if ((config.github.mirrorIssues || config.github.mirrorStarred || config.github.mirrorOrganizations || config.github.singleRepo) 
		&& config.github.token === undefined) {
		throw new Error(
			"invalid configuration, mirroring issues, starred repositories, organizations, or a single repo requires setting GITHUB_TOKEN",
		);
	}

	return config;
}
