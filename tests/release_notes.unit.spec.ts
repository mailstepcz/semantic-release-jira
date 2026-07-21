import { test, expect } from "@playwright/test";
import Handlebars from "handlebars";
import * as _ from "lodash";
import {
  DEFAULT_RELEASE_DESCRIPTION_TEMPLATE,
  DEFAULT_VERSION_TEMPLATE,
} from "../src/consts";
import type { JiraIssue, ReleaseCommit } from "../src/types";

function render(issues: JiraIssue[], commits: ReleaseCommit[]): string {
  const tpl = Handlebars.compile(DEFAULT_RELEASE_DESCRIPTION_TEMPLATE);
  return tpl({ version: "v1.2.3", issues, commits });
}

test("default version template interpolates the version", () => {
  const name = _.template(DEFAULT_VERSION_TEMPLATE)({ version: "1.2.3" });
  expect(name).toBe("v1.2.3");
});

test("renders issue and commit sections", () => {
  const out = render(
    [
      {
        type: "Bug",
        key: "MAWI-1",
        link: "https://jira.example.com/browse/MAWI-1",
        title: "Fix the thing",
        description: "short desc",
        assignee: "Jane Doe",
      },
    ],
    [{ message: "chore: cleanup", author: "Alice" }],
  );

  expect(out).toContain("# Release notes - v1.2.3");
  expect(out).toContain(
    "- [Bug] [MAWI-1](https://jira.example.com/browse/MAWI-1) Fix the thing",
  );
  expect(out).toContain("Short description: short desc");
  expect(out).toContain("Assigned to: Jane Doe");
  expect(out).toContain("- chore: cleanup");
  expect(out).toContain("Committed by: Alice");
});

test("does NOT HTML-escape free-text fields (plain-text Jira description)", () => {
  const out = render(
    [
      {
        type: "Bug",
        key: "MAWI-1",
        link: "https://jira.example.com/browse/MAWI-1",
        title: 'handle a<b & "quoted"',
        description: "x>y",
        assignee: "Jane & John",
      },
    ],
    [{ message: "fix: a<b && c>d", author: "Jane <j@x.com>" }],
  );

  // Raw characters must survive verbatim (triple-stache), not become entities.
  expect(out).toContain('handle a<b & "quoted"');
  expect(out).toContain("Short description: x>y");
  expect(out).toContain("Assigned to: Jane & John");
  expect(out).toContain("fix: a<b && c>d");
  expect(out).toContain("Committed by: Jane <j@x.com>");

  expect(out).not.toContain("&lt;");
  expect(out).not.toContain("&amp;");
  expect(out).not.toContain("&quot;");
  expect(out).not.toContain("&gt;");
});
