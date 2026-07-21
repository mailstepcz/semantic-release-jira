import { test, expect } from "@playwright/test";
import { getContributions } from "../src/success";
import {
  fakeIssue,
  makeCommit,
  mockJiraClient,
  silentLogger,
} from "./support";

const HOST = "https://jira.example.com";

test("deduplicates ticket keys case-insensitively and fetches each once", async () => {
  const { client, getIssueCalls } = mockJiraClient({
    "MAWI-1": fakeIssue({ key: "MAWI-1", type: "Story" }),
    "MAWI-2": fakeIssue({ key: "MAWI-2", type: "Story" }),
  });

  const { issues } = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [
      makeCommit("feat: MAWI-1 first"),
      makeCommit("fix: mawi-1 again (lowercase)"),
      makeCommit("fix: MAWI-1 and MAWI-2 together"),
    ],
    silentLogger,
  );

  // MAWI-1 referenced 3x (mixed case), MAWI-2 once -> two unique fetches.
  expect(getIssueCalls.map((c) => c.issueIdOrKey)).toEqual(["MAWI-1", "MAWI-2"]);
  expect(issues.map((i) => i.key)).toEqual(["MAWI-1", "MAWI-2"]);
});

test("requests only the fields the plugin renders", async () => {
  const { client, getIssueCalls } = mockJiraClient({
    "MAWI-1": fakeIssue({ key: "MAWI-1" }),
  });

  await getContributions(client, ["MAWI"], HOST, [makeCommit("feat: MAWI-1")], silentLogger);

  expect(getIssueCalls[0].fields).toEqual([
    "summary",
    "assignee",
    "description",
    "issuetype",
  ]);
});

test("collects commits that reference no ticket", async () => {
  const { client, getIssueCalls } = mockJiraClient({
    "MAWI-1": fakeIssue({ key: "MAWI-1" }),
  });

  const { issues, commits } = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [
      makeCommit("feat: MAWI-1 has ticket"),
      makeCommit("chore: no ticket here", { author: "Alice" }),
    ],
    silentLogger,
  );

  expect(issues.map((i) => i.key)).toEqual(["MAWI-1"]);
  expect(getIssueCalls).toHaveLength(1);
  expect(commits).toEqual([
    { author: "Alice", message: "chore: no ticket here" },
  ]);
});

test("respects the word boundary and does not match a longer prefix", async () => {
  const { client, getIssueCalls } = mockJiraClient({});

  const { issues, commits } = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [makeCommit("fix: FMAWI-1 should not match")],
    silentLogger,
  );

  expect(getIssueCalls).toHaveLength(0);
  expect(issues).toHaveLength(0);
  expect(commits).toHaveLength(1);
});

test("matches multiple configured prefixes", async () => {
  const { client } = mockJiraClient({
    "MAWI-1": fakeIssue({ key: "MAWI-1", type: "Story" }),
    "OPS-9": fakeIssue({ key: "OPS-9", type: "Story" }),
  });

  const { issues } = await getContributions(
    client,
    ["MAWI", "OPS"],
    HOST,
    [makeCommit("feat: MAWI-1 and OPS-9")],
    silentLogger,
  );

  expect(issues.map((i) => i.key).sort()).toEqual(["MAWI-1", "OPS-9"]);
});

test("orders issues: default priority puts Bug first, rest by first appearance", async () => {
  const { client } = mockJiraClient({
    "MAWI-1": fakeIssue({ key: "MAWI-1", type: "Story" }),
    "MAWI-2": fakeIssue({ key: "MAWI-2", type: "Bug" }),
    "MAWI-3": fakeIssue({ key: "MAWI-3", type: "Task" }),
    "MAWI-4": fakeIssue({ key: "MAWI-4", type: "Bug" }),
  });

  const { issues } = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [makeCommit("feat: MAWI-1 MAWI-2 MAWI-3 MAWI-4")],
    silentLogger,
  );

  // Bugs first (in first-appearance order), then Story, then Task.
  expect(issues.map((i) => i.key)).toEqual([
    "MAWI-2",
    "MAWI-4",
    "MAWI-1",
    "MAWI-3",
  ]);
});

test("orders issues by a custom, case-insensitive typePriority", async () => {
  const { client } = mockJiraClient({
    "MAWI-1": fakeIssue({ key: "MAWI-1", type: "Story" }),
    "MAWI-2": fakeIssue({ key: "MAWI-2", type: "Bug" }),
    "MAWI-3": fakeIssue({ key: "MAWI-3", type: "Task" }),
  });

  const { issues } = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [makeCommit("feat: MAWI-1 MAWI-2 MAWI-3")],
    silentLogger,
    ["task", "bug"], // lowercase must still match Jira's "Task"/"Bug"
  );

  expect(issues.map((i) => i.type)).toEqual(["Task", "Bug", "Story"]);
});

test("maps issue metadata with sensible fallbacks", async () => {
  const { client } = mockJiraClient({
    "MAWI-1": fakeIssue({
      key: "MAWI-1",
      summary: "A title",
      assignee: null, // unassigned
      type: null, // unknown type
      descriptionText: "hello world",
    }),
  });

  const { issues } = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [makeCommit("feat: MAWI-1")],
    silentLogger,
  );

  expect(issues[0]).toEqual({
    title: "A title",
    assignee: "unassigned",
    type: "unknown",
    description: "hello world",
    key: "MAWI-1",
    link: "https://jira.example.com/browse/MAWI-1",
  });
});

test("skips (best-effort) a referenced ticket that cannot be fetched (404)", async () => {
  // MAWI-2 is unknown -> mock returns a 404 "Issue does not exist" body.
  // The hook runs post-publish, so an unreadable ticket is skipped, not fatal.
  const { client } = mockJiraClient({
    "MAWI-1": fakeIssue({ key: "MAWI-1" }),
  });

  const result = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [makeCommit("feat: MAWI-1 and MAWI-2")],
    silentLogger,
  );

  expect(result.issues.map((i) => i.key)).toEqual(["MAWI-1"]);
});

test("skips (best-effort) a ticket on any other fetch error (5xx / network)", async () => {
  const { client } = mockJiraClient(
    { "MAWI-1": fakeIssue({ key: "MAWI-1" }) },
    {
      rejectKeys: {
        "MAWI-1": {
          status: 503,
          response: { data: { errorMessages: ["Service unavailable"] } },
        },
      },
    },
  );

  const result = await getContributions(
    client,
    ["MAWI"],
    HOST,
    [makeCommit("feat: MAWI-1")],
    silentLogger,
  );

  expect(result.issues).toEqual([]);
});
