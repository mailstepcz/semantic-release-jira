import {
  JiraIssue,
  PluginConfig,
  ReleaseCommit,
  ReleaseContributions,
} from "./types";
import { SuccessContext, Commit } from "semantic-release";
import { escapeRegExp, describeJiraError } from "./utils";
import { Signale } from "signale";
import * as _ from "lodash";
import Handlebars from "handlebars";
import {
  DEFAULT_RELEASE_DESCRIPTION_TEMPLATE,
  DEFAULT_VERSION_TEMPLATE,
} from "./consts";
import { CreateJiraClient } from "./jira-client";
import { Version3Client } from "jira.js";
import { Version } from "jira.js/version3/models/version";
import pLimit from "p-limit";
import SemanticReleaseError from "@semantic-release/error";

async function getIssueMetadata(
  c: Version3Client,
  issueKey: string,
  jiraHost: string,
  logger: Signale,
): Promise<JiraIssue> {
  logger.info(`Loading info for issue ${issueKey}`);
  // Request only the fields we render, so a change to unrelated fields can't
  // affect this call and the payload stays small.
  const issue = await c.issues.getIssue({
    issueIdOrKey: issueKey,
    fields: ["summary", "assignee", "description", "issuetype"],
  });
  return {
    title: issue.fields.summary,
    assignee: issue.fields?.assignee?.displayName || "unassigned",
    description: _.truncate(
      issue.fields.description?.content?.[0]?.content?.[0]?.text,
      {
        length: 200,
      },
    ),
    key: issue.key,
    link: `${jiraHost}/browse/${issue.key}`,
    type: issue.fields.issuetype?.name || "unknown",
  };
}

const DEFAULT_TYPE_PRIORITY = ["Bug"];

function orderByType(issues: JiraIssue[], priority: string[]): JiraIssue[] {
  const groups = new Map<string, JiraIssue[]>();
  for (const issue of issues) {
    const group = groups.get(issue.type);
    if (group) {
      group.push(issue);
    } else {
      groups.set(issue.type, [issue]);
    }
  }

  // Match priority entries against actual issue types case-insensitively,
  // so `["bug"]` still puts Jira's "Bug" section first.
  const remaining = new Set(groups.keys());
  const types: string[] = [];
  for (const p of priority) {
    for (const t of remaining) {
      if (t.toLowerCase() === p.toLowerCase()) {
        types.push(t);
        remaining.delete(t);
      }
    }
  }
  for (const t of groups.keys()) {
    if (remaining.has(t)) {
      types.push(t);
    }
  }

  return types.flatMap((t) => groups.get(t) || []);
}

export async function getContributions(
  c: Version3Client,
  ticketPrefixes: string[],
  jiraHost: string,
  commits: readonly Commit[],
  logger: Signale,
  typePriority: string[] = DEFAULT_TYPE_PRIORITY,
): Promise<ReleaseContributions> {
  const releaseCommits: ReleaseCommit[] = [];
  const seenKeys = new Set<string>();
  const orderedKeys: string[] = [];

  const patterns: RegExp[] = [];

  for (const prefix of ticketPrefixes) {
    if (prefix === undefined) {
      continue;
    }
    const pattern = new RegExp(`\\b${escapeRegExp(prefix)}-(\\d+)\\b`, "giu");
    patterns.push(pattern);
  }

  // Pass A: collect unique ticket keys (first-appearance order) and
  // commits that reference no ticket.
  for (const commit of commits) {
    let found = false;
    for (const pattern of patterns) {
      const matches = commit.message.match(pattern);
      if (matches) {
        found = true;
        for (const match of matches) {
          const key = match.toUpperCase();
          logger.info(
            `Found matching ticket ${key} in commit ${commit.commit.short}`,
          );
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            orderedKeys.push(key);
          }
        }
      }
    }
    if (!found) {
      releaseCommits.push({
        author: commit.author.name,
        message: commit.message,
      });
    }
  }

  // Pass B: fetch each unique ticket once, in parallel (bounded).
  // Best-effort: a ticket that cannot be read is logged and skipped rather
  // than aborting, since this hook runs after the package/GitHub release has
  // already been published, so failing here would report a non-idempotent
  // failure for an already-shipped release.
  const limit = pLimit(10);
  const fetched = await Promise.all(
    orderedKeys.map((key) =>
      limit(async () => {
        try {
          return await getIssueMetadata(c, key, jiraHost, logger);
        } catch (err: unknown) {
          logger.warn(`Skipping ticket ${key}: ${describeJiraError(err)}`);
          return null;
        }
      }),
    ),
  );
  const tickets = fetched.filter((t): t is JiraIssue => t !== null);

  return {
    commits: releaseCommits,
    issues: orderByType(tickets, typePriority),
  };
}

async function findOrCreateVersion(
  c: Version3Client,
  projectIdOrKey: string,
  newVersionName: string,
  newVersionDescription: string,
  logger: Signale,
): Promise<Version> {
  let versions;
  try {
    versions = await c.projectVersions.getProjectVersions({
      projectIdOrKey,
    });
  } catch (err: unknown) {
    throw new SemanticReleaseError(
      `Failed to load versions for project '${projectIdOrKey}': ${describeJiraError(err)}`,
    );
  }

  for (const v of versions) {
    if (v.name === newVersionName) {
      logger.info(`Found existing jira release with id: ${v.id}`);
      return v;
    }
  }

  try {
    logger.info(
      `Creating new version in jira projectId: ${projectIdOrKey}, versionName: ${newVersionName}`,
    );

    logger.info(`Getting driver info`);

    const driver = await c.myself.getCurrentUser();

    logger.success(
      `Caller info acquired '${driver.name} / ${driver.emailAddress}'`,
    );

    const version = await c.projectVersions.createVersion({
      name: newVersionName,
      description: newVersionDescription,
      projectId: projectIdOrKey,
      released: true,
      releaseDate: new Date().toISOString(),
      archived: false,
      driver: driver.accountId,
    });

    logger.success(`Created new jira version ${version.id}`);
    return version;
  } catch (err: unknown) {
    throw new SemanticReleaseError(
      `Failed to create Jira version '${newVersionName}': ${describeJiraError(err)}`,
    );
  }
}

async function editIssueFixVersions(
  c: Version3Client,
  ticket: JiraIssue,
  versionId: string,
  logger: Signale,
): Promise<void> {
  logger.info(`Adding issue '${ticket.key}' to a release '${versionId}'`);
  try {
    await c.issues.editIssue({
      issueIdOrKey: ticket.key,
      update: {
        fixVersions: [
          {
            add: { id: versionId },
          },
        ],
      },
    });
    logger.complete(
      `Issue '${ticket.key}' was successfully added to a release.`,
    );
  } catch (err: any) {
    // Best-effort: tolerate 400/404 (issue gone, field rejected) and skip;
    // other errors abort so a systemic linking failure is still surfaced.
    const allowedStatusCodes = [400, 404];
    if (allowedStatusCodes.includes(err?.status)) {
      logger.warn(
        `Issue '${ticket.key}' was not added to a release (status ${err.status}).`,
      );
      return;
    }

    throw new SemanticReleaseError(
      `Failed to add issue '${ticket.key}' to release '${versionId}': ${describeJiraError(err)}`,
    );
  }
}

export async function success(
  config: PluginConfig,
  context: SuccessContext,
): Promise<void> {
  const { env, logger, commits, nextRelease } = context;
  const {
    jiraHost,
    project: projectKey,
    ticketPrefixes,
    versionTemplate: definedVersionTemplate,
    typePriority,
  } = config;

  let c: Version3Client;
  try {
    c = CreateJiraClient(logger, jiraHost, env.JIRA_EMAIL, env.JIRA_TOKEN);
  } catch (err: unknown) {
    throw new SemanticReleaseError(
      `Failed to initialise Jira client: ${describeJiraError(err)}`,
    );
  }

  const contributions = await getContributions(
    c,
    ticketPrefixes,
    jiraHost,
    commits,
    logger,
    typePriority,
  );

  const versionTemplate = _.template(
    definedVersionTemplate || DEFAULT_VERSION_TEMPLATE,
  );

  const descriptionTemplate = Handlebars.compile(
    DEFAULT_RELEASE_DESCRIPTION_TEMPLATE,
  );

  const newVersionName = versionTemplate({ version: nextRelease.version });
  const newVersionDescription = descriptionTemplate({
    version: newVersionName,
    issues: contributions.issues,
    commits: contributions.commits,
  });

  logger.info(`Using jira release '${newVersionName}'`);
  logger.info(
    `using jira description '${DEFAULT_RELEASE_DESCRIPTION_TEMPLATE}'`,
  );

  let project;
  try {
    project = await c.projects.getProject({ projectIdOrKey: projectKey });
  } catch (err: unknown) {
    throw new SemanticReleaseError(
      `Failed to load Jira project '${projectKey}': ${describeJiraError(err)}`,
    );
  }
  if (!project.id) {
    throw new SemanticReleaseError("Missing project id!");
  }

  logger.info(
    `Attempting to create new version for project ${project.name}, id: ${project.id}`,
  );

  const version = await findOrCreateVersion(
    c,
    project.id,
    newVersionName,
    newVersionDescription,
    logger,
  );

  if (!version.id) {
    throw new SemanticReleaseError(
      `Jira version '${newVersionName}' has no id; cannot link issues.`,
    );
  }

  const concurrentLimit = pLimit(10);

  const edits: Promise<void>[] = [];
  for (const ticket of contributions.issues) {
    edits.push(
      concurrentLimit(() =>
        editIssueFixVersions(c, ticket, version.id as string, logger),
      ),
    );
  }

  await Promise.all(edits);
}
