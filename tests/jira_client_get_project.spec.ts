import { test, expect } from "@playwright/test";
import { CreateJiraClient } from "../src/jira-client";

test("get jira project", async ({ trace }) => {
  const client = CreateJiraClient(
    process.env.JIRA_HOST || "",
    process.env.JIRA_EMAIL || "",
    process.env.JIRA_TOKEN || ""
  );

  const p = await client.projects.getProject({
    projectIdOrKey: process.env.JIRA_PROJECT || "",
  });

  console.log(p.id);
});
