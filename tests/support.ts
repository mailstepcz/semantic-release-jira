import type { Commit } from "semantic-release";
import type { Signale } from "signale";
import type { Version3Client } from "jira.js";

/**
 * True only when a full set of live Jira credentials is present in the
 * environment. The integration specs use this to self-skip so the suite stays
 * green in CI (and for contributors without credentials) while still running
 * end-to-end locally when a `.env` is provided.
 */
export const hasLiveJira = !!(
  process.env.JIRA_HOST &&
  process.env.JIRA_EMAIL &&
  process.env.JIRA_TOKEN &&
  process.env.JIRA_PROJECT
);

/** A Signale-shaped logger that discards output, for quiet unit tests. */
export const silentLogger = new Proxy(
  {},
  {
    get() {
      return () => undefined;
    },
  },
) as unknown as Signale;

/** Build a fully-typed semantic-release Commit from a message. */
export function makeCommit(
  message: string,
  opts: { short?: string; author?: string } = {},
): Commit {
  const person = {
    name: opts.author ?? "Dev",
    email: "dev@example.com",
    short: "dev",
  };
  return {
    message,
    subject: message.split("\n")[0],
    body: "",
    hash: "0".repeat(40),
    committerDate: "2026-01-01T00:00:00.000Z",
    author: person,
    committer: person,
    commit: { long: "0".repeat(40), short: opts.short ?? "0000000" },
    tree: { long: "", short: "" },
  };
}

export interface FakeIssueInput {
  key: string;
  summary?: string;
  /** Pass `null` to simulate an unassigned issue. */
  assignee?: string | null;
  /** Pass `null` to simulate a missing issue type. */
  type?: string | null;
  descriptionText?: string;
}

/** Shape a fake response matching the subset of jira.js `getIssue` we read. */
export function fakeIssue(input: FakeIssueInput) {
  return {
    key: input.key,
    fields: {
      summary: input.summary ?? `Summary for ${input.key}`,
      assignee:
        input.assignee === null
          ? null
          : { displayName: input.assignee ?? "Jane Doe" },
      issuetype:
        input.type === null ? undefined : { name: input.type ?? "Story" },
      description: input.descriptionText
        ? { content: [{ content: [{ text: input.descriptionText }] }] }
        : undefined,
    },
  };
}

export interface MockJiraClient {
  client: Version3Client;
  /** Records the params of every `issues.getIssue` call, in order. */
  getIssueCalls: Array<{ issueIdOrKey: string; fields?: string[] }>;
}

/**
 * Build an in-memory Version3Client stub for `getContributions`. Keys must be
 * upper-cased (getContributions normalises before it calls the client).
 * Unknown keys reject with a 404 "Issue does not exist" body; `rejectKeys`
 * lets a test inject an arbitrary rejection for a given key.
 */
export function mockJiraClient(
  issuesByKey: Record<string, ReturnType<typeof fakeIssue>>,
  opts: { rejectKeys?: Record<string, unknown> } = {},
): MockJiraClient {
  const getIssueCalls: MockJiraClient["getIssueCalls"] = [];
  const client = {
    issues: {
      async getIssue(params: { issueIdOrKey: string; fields?: string[] }) {
        getIssueCalls.push(params);
        const key = params.issueIdOrKey;
        if (opts.rejectKeys && key in opts.rejectKeys) {
          throw opts.rejectKeys[key];
        }
        const issue = issuesByKey[key];
        if (!issue) {
          throw {
            status: 404,
            response: { data: { errorMessages: ["Issue does not exist."] } },
          };
        }
        return issue;
      },
    },
  } as unknown as Version3Client;
  return { client, getIssueCalls };
}
