import { test, expect } from "@playwright/test";
import { describeJiraError } from "../src/utils";

test("formats jira errorMessages with the HTTP status", () => {
  const err = {
    status: 404,
    response: { data: { errorMessages: ["Issue does not exist."], errors: {} } },
  };
  expect(describeJiraError(err)).toBe("Issue does not exist. (status 404)");
});

test("formats field-level errors", () => {
  const err = {
    status: 400,
    response: {
      data: { errorMessages: [], errors: { fixVersions: "cannot be set" } },
    },
  };
  expect(describeJiraError(err)).toBe("fixVersions: cannot be set (status 400)");
});

test("combines errorMessages and field errors", () => {
  const err = {
    status: 400,
    response: {
      data: {
        errorMessages: ["Bad request"],
        errors: { name: "already used" },
      },
    },
  };
  expect(describeJiraError(err)).toBe("Bad request; name: already used (status 400)");
});

test("falls back to the error message when there is no jira body", () => {
  expect(describeJiraError({ message: "connect ECONNREFUSED" })).toBe(
    "connect ECONNREFUSED",
  );
});

test("uses response.status when the top-level status is absent", () => {
  const err = { response: { status: 401, data: {} }, message: "Unauthorized" };
  expect(describeJiraError(err)).toBe("Unauthorized (status 401)");
});

test("degrades gracefully for unknown error shapes", () => {
  expect(describeJiraError(undefined)).toBe("Unknown Jira error");
  expect(describeJiraError({})).toBe("Unknown Jira error");
  expect(describeJiraError("boom")).toBe("Unknown Jira error");
});
