import { Octokit } from "@octokit/rest";
import { default as get } from "./get-github-repositories";

describe("get-github-repositories", () => {
	xit("fetches public repositories", async () => {
		const octokit = new Octokit({
			auth: null,
		});

		const result = await get(octokit, undefined);

		expect(result).toEqual([]);
	});
});
