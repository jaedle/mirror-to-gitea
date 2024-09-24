import { configuration } from "./configuration.mjs";

const aGithubUsername = "A_GITHUB_USERNAME";
const aGiteaUrl = "https://gitea.url";
const aGiteaToken = "secret-gitea-token";
const aGithubToken = "a-github-token";

const variables = [
	"DELAY",
	"DRY_RUN",
	"GITEA_TOKEN",
	"GITEA_URL",
	"GITHUB_TOKEN",
	"GITHUB_USERNAME",
	"MIRROR_PRIVATE_REPOSITORIES",
	"SKIP_FORKS",
];

function provideMandatoryVariables() {
	process.env.GITHUB_USERNAME = aGithubUsername;
	process.env.GITEA_URL = aGiteaUrl;
	process.env.GITEA_TOKEN = aGiteaToken;
}

const defaultDelay = 3600;
describe("configuration", () => {
	beforeEach(() => {
		for (const variable of variables) {
			delete process.env[variable];
		}
	});

	it("reads configuration with default values", () => {
		process.env.GITHUB_USERNAME = aGithubUsername;
		process.env.GITEA_URL = aGiteaUrl;
		process.env.GITEA_TOKEN = aGiteaToken;

		const config = configuration();

		expect(config.github.username).toEqual(aGithubUsername);
		expect(config.github.token).toBeUndefined();
		expect(config.github.skipForks).toEqual(false);

		expect(config.gitea.url).toEqual(aGiteaUrl);
		expect(config.gitea.token).toEqual(aGiteaToken);

		expect(config.delay).toEqual(defaultDelay);
	});

	it("requires gitea url", () => {
		provideMandatoryVariables();
		delete process.env.GITEA_URL;

		expect(() => configuration()).toThrow(
			new Error("invalid configuration, please provide GITEA_URL"),
		);
	});

	it("requires gitea token", () => {
		provideMandatoryVariables();
		delete process.env.GITEA_TOKEN;

		expect(() => configuration()).toThrow(
			new Error("invalid configuration, please provide GITEA_TOKEN"),
		);
	});

	it("requires github username", () => {
		provideMandatoryVariables();
		delete process.env.GITHUB_USERNAME;

		expect(() => configuration()).toThrow(
			new Error("invalid configuration, please provide GITHUB_USERNAME"),
		);
	});

	it("reads github token", () => {
		provideMandatoryVariables();
		process.env.GITHUB_TOKEN = aGithubToken;

		const config = configuration();

		expect(config.github.token).toEqual(aGithubToken);
	});

	describe("dry run flag", () => {
		it("treats true as true", () => {
			provideMandatoryVariables();
			process.env.DRY_RUN = "true";

			const config = configuration();

			expect(config.dryRun).toEqual(true);
		});

		it("treats 1 as true", () => {
			provideMandatoryVariables();
			process.env.DRY_RUN = "1";

			const config = configuration();

			expect(config.dryRun).toEqual(true);
		});

		it("treats missing flag as false", () => {
			provideMandatoryVariables();

			const config = configuration();

			expect(config.dryRun).toEqual(false);
		});
	});

	describe("skip forks flag", () => {
		it("treats true as true", () => {
			provideMandatoryVariables();
			process.env.SKIP_FORKS = "true";

			const config = configuration();

			expect(config.github.skipForks).toEqual(true);
		});

		it("treats 1 as true", () => {
			provideMandatoryVariables();
			process.env.SKIP_FORKS = "1";

			const config = configuration();

			expect(config.github.skipForks).toEqual(true);
		});

		it("treats missing flag as false", () => {
			provideMandatoryVariables();

			const config = configuration();

			expect(config.github.skipForks).toEqual(false);
		});
	});

	describe("mirror private repositories flag", () => {
		it("treats true as true", () => {
			provideMandatoryVariables();
			process.env.GITHUB_TOKEN = aGithubToken;
			process.env.MIRROR_PRIVATE_REPOSITORIES = "true";

			const config = configuration();

			expect(config.github.privateRepositories).toEqual(true);
		});

		it("treats 1 as true", () => {
			provideMandatoryVariables();
			process.env.GITHUB_TOKEN = aGithubToken;

			process.env.MIRROR_PRIVATE_REPOSITORIES = "1";

			const config = configuration();

			expect(config.github.privateRepositories).toEqual(true);
		});

		it("treats missing flag as false", () => {
			provideMandatoryVariables();

			const config = configuration();

			expect(config.github.privateRepositories).toEqual(false);
		});
	});

	it("requires a github token on private repository mirroring", () => {
		provideMandatoryVariables();
		process.env.MIRROR_PRIVATE_REPOSITORIES = "true";

		expect(() => configuration()).toThrow(
			new Error(
				"invalid configuration, mirroring private repositories requires setting GITHUB_TOKEN",
			),
		);
	});

	it("parses delay", () => {
		provideMandatoryVariables();
		process.env.DELAY = "1200";

		const config = configuration();

		expect(config.delay).toEqual(1200);
	});
});
