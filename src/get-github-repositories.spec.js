import {default as get} from './get-github-repositories';
import {Octokit} from "@octokit/rest";

describe('get-github-repfalseositories', () => {
    xit('fetches public repositories', async () => {
        const octokit = new Octokit({
            auth: null,
        });

        const result = await get(octokit, undefined);

        expect(result).toEqual([]);
    });
});