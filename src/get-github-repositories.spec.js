import { Moctokit } from "@kie/mock-github";
import { Octokit } from "@octokit/rest";
import { default as get } from "./get-github-repositories";

describe("get-github-repositories", () => {
	it("fetches public repositories", async () => {
		const moctokit = new Moctokit();
		moctokit.rest.repos.listForUser({ username: "jaedle" }).reply({
			status: 200,
			data: [
				{
					name: "repo1",
					clone_url: "clone-url-of-repo1",
					private: false,
					fork: false,
				},
				{
					name: "repo2",
					clone_url: "clone-url-of-repo2",
					private: false,
					fork: true,
				},
				{
					name: "repo3",
					clone_url: "clone-url-of-repo3",
					private: false,
					fork: false,
				},
			],
		});

		const result = await get(new Octokit(), {
			username: "jaedle",
			privateRepositories: false,
			skipForks: false,
		});

		expect(result).toEqual([
			{ name: "repo1", url: "clone-url-of-repo1", private: false, fork: false },
			{ name: "repo2", url: "clone-url-of-repo2", private: false, fork: true },
			{ name: "repo3", url: "clone-url-of-repo3", private: false, fork: false },
		]);
	});

	it("skips forks if requested", async () => {
		const moctokit = new Moctokit();
		moctokit.rest.repos.listForUser({ username: "jaedle" }).reply({
			status: 200,
			data: [
				{
					name: "repo1",
					clone_url: "clone-url-of-repo1",
					private: false,
					fork: false,
				},
				{
					name: "repo2",
					clone_url: "clone-url-of-repo2",
					private: false,
					fork: true,
				},
				{
					name: "repo3",
					clone_url: "clone-url-of-repo3",
					private: false,
					fork: false,
				},
			],
		});

		const result = await get(new Octokit(), {
			username: "jaedle",
			privateRepositories: false,
			skipForks: true,
		});

		expect(result).toEqual([
			{ name: "repo1", url: "clone-url-of-repo1", private: false, fork: false },
			{ name: "repo3", url: "clone-url-of-repo3", private: false, fork: false },
		]);
	});
});
