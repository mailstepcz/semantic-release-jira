import { test, expect } from "@playwright/test";
import { CreateJiraClient } from "../src/jira-client";
import { JiraIssue } from "../src/types";
import { DEFAULT_RELEASE_DESCRIPTION_TEMPLATE } from "../src/consts";
import { hasLiveJira } from "./support";
import signale from "signale";
import * as _ from "lodash";
import Handlebars from "handlebars";

test("get jira issue", async ({}) => {
  test.skip(!hasLiveJira, "requires live Jira credentials");
  const client = CreateJiraClient(
    signale,
    process.env.JIRA_HOST || "",
    process.env.JIRA_EMAIL || "",
    process.env.JIRA_TOKEN || "",
  );

  try {
    const i = await client.issues.getIssue({
      issueIdOrKey: "MAWI-18868888",
    });
    //   console.log(i);
    const ji: JiraIssue = {
      title: i.fields.summary,
      assignee: i.fields.assignee.displayName || "",
      description: _.truncate(
        i.fields.description?.content?.[0]?.content?.[0].text,
        {
          length: 100,
        },
      ),
      type: i.fields.issuetype?.name || "unknown",
      key: i.key,
      link: `${process.env.JIRA_HOST}/browse/${i.key}`,
    };

    const t = Handlebars.compile(DEFAULT_RELEASE_DESCRIPTION_TEMPLATE);
    const res = t({ version: "company-wide v1.1.1", issues: [ji, ji] });
    console.log(ji);
    console.log(res);
  } catch (err: any) {
    console.log(err.response.data.errorMessages);
    throw err;
  }
});
