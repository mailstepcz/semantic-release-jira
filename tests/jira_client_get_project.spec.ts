import { test, expect } from "@playwright/test";
import { CreateJiraClient } from "../src/jira-client";
import { hasLiveJira } from "./support";
import signale from "signale";

test("get jira project", async ({}) => {
  test.skip(!hasLiveJira, "requires live Jira credentials");
  const client = CreateJiraClient(
    signale,
    process.env.JIRA_HOST || "",
    process.env.JIRA_EMAIL || "",
    process.env.JIRA_TOKEN || "",
  );

  const p = await client.projects.getProject({
    projectIdOrKey: process.env.JIRA_PROJECT || "",
  });

  console.log(p);

  console.log(Number(p.id));
});
