import { Octokit } from "@octokit/rest";

const authToken = process.env.GITHUB_TOKEN || process.env.GITHUB_API_TOKEN;
const octokit = new Octokit({ auth: authToken });
await octokit.issues.createComment({
  owner: "microsoft",
  repo: "TypeScript-DOM-lib-generator",
  issue_number: 1282,
  body: "Hi @saschanaz, kindly pinging you as the 'Update core dependencies' job failed today.",
});
