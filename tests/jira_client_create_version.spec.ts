import { test, expect } from "@playwright/test";
import { CreateJiraClient } from "../src/jira-client";
import signale from "signale";

test("get jira project", async ({}) => {
  const client = CreateJiraClient(
    signale,
    process.env.JIRA_HOST || "",
    process.env.JIRA_EMAIL || "",
    process.env.JIRA_TOKEN || ""
  );

  const p = await client.projects.getProject({
    projectIdOrKey: process.env.JIRA_PROJECT || "",
  });

  try {
    await client.projectVersions.createVersion({
      name: "test",
      description: "test",
      projectId: p.id,
      released: false,
      archived: true,
    });
  } catch (err) {
    const e = JSON.stringify(err);
    signale.error(e);
    throw err;
  }
});
