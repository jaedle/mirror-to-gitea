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
		},
		gitea: {
			url: mustReadEnv("GITEA_URL"),
			token: mustReadEnv("GITEA_TOKEN"),
		},
		dryRun: readBoolean("DRY_RUN"),
		delay: readInt("DELAY") ?? defaultDelay,
		include: (readEnv("INCLUDE") ?? defaultInclude).split(",").map(f => f.trim()),
		exclude: (readEnv("EXCLUDE") ?? defaultExclude).split(",").map(f => f.trim()),
		singleRun: readBoolean("SINGLE_RUN"),
	};

	if (config.github.privateRepositories && config.github.token === undefined) {
		throw new Error(
			"invalid configuration, mirroring private repositories requires setting GITHUB_TOKEN",
		);
	}

	return config;
}
