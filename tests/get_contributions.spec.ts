import { test, expect } from "@playwright/test";
import { CreateJiraClient } from "../src/jira-client";
import { getContributions } from "../src/success";
import signale from "signale";

test("create jira project version", async ({}) => {
  const client = CreateJiraClient(
    signale,
    process.env.JIRA_HOST || "",
    process.env.JIRA_EMAIL || "",
    process.env.JIRA_TOKEN || "",
  );

  const t = await getContributions(
    client,
    ["MAWIGO"],
    process.env.JIRA_HOST || "",
    [
      {
        author: {
          email: "test@test.com",
          name: "Ondrej Belza",
          short: "short",
        },
        body: "asd",
        commit: {
          long: "long commit",
          short: "short commit",
        },
        committer: {
          email: "test@test.com",
          name: "Ondrej Belza",
          short: "short",
        },
        committerDate: "asd",
        hash: "hash",
        message: "feat: MAWIGO-0 test message",
        subject: "",
        tree: {
          long: "",
          short: "",
        },
      },
    ],
    signale,
  );

  console.log(t);
});
