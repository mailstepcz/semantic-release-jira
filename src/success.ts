import { JiraIssue, PluginConfig } from "./types";
import { SuccessContext, Commit } from "semantic-release";
import { escapeRegExp } from "./utils";
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
  logger: Signale
): Promise<JiraIssue> {
  logger.info(`Loading info for issue ${issueKey}`);
  const issue = await c.issues.getIssue({ issueIdOrKey: issueKey });
  return {
    title: issue.fields.summary,
    assignee: issue.fields.assignee.displayName || "unassigned",
    description: _.truncate(
      issue.fields.description?.content?.[0]?.content?.[0].text,
      {
        length: 100,
      }
    ),
    key: issue.key,
    link: `${jiraHost}/browse/${issue.key}`,
    type: issue.fields.issuetype?.name || "unknown",
  };
}

async function getMentionedTickets(
  c: Version3Client,
  ticketPrefix: string,
  jiraHost: string,
  commits: readonly Commit[],
  logger: Signale
): Promise<JiraIssue[]> {
  const tickets = new Set<JiraIssue>();

  const pattern = new RegExp(
    `\\b${escapeRegExp(ticketPrefix)}-(\\d+)\\b`,
    "giu"
  );

  for (const commit of commits) {
    const matches = commit.message.match(pattern);
    if (matches) {
      for (const match of matches) {
        logger.info(
          `Found matching ticket it commit ${match} in ${commit.commit.short}`
        );
        const issue = await getIssueMetadata(c, match, jiraHost, logger);
        tickets.add(issue);
      }
    }
  }

  return [...tickets];
}

async function findOrCreateVersion(
  c: Version3Client,
  projectIdOrKey: string,
  newVersionName: string,
  newVersionDescription: string,
  logger: Signale
): Promise<Version> {
  const versions = await c.projectVersions.getProjectVersions({
    projectIdOrKey,
  });

  for (const v of versions) {
    if (v.name === newVersionName) {
      logger.info(`Found existing jira release with id: ${v.id}`);
      return v;
    }
  }

  try {
    logger.info(
      `Creating new version in jira projectId: ${projectIdOrKey}, versionName: ${newVersionName}`
    );

    logger.info(`Getting driver info`);

    const driver = await c.myself.getCurrentUser();

    logger.success(
      `Caller info acquired '${driver.name} / ${driver.emailAddress}'`
    );

    const version = await c.projectVersions.createVersion({
      name: newVersionName,
      description: newVersionDescription,
      projectId: projectIdOrKey as any,
      released: true,
      releaseDate: new Date().toISOString(),
      archived: false,
      driver: driver.accountId,
    });

    logger.success(`Created new jira version ${version.id}`);
    return version;
  } catch (err) {
    const resp = JSON.stringify(err);
    logger.error(resp);
    throw new SemanticReleaseError(err as string);
  }
}

async function editIssueFixVersions(
  c: Version3Client,
  ticket: JiraIssue,
  versionId: string,
  logger: Signale
): Promise<void> {
  logger.info(`Adding issue '${ticket}' to a release '${versionId}'`);
  c.issues
    .editIssue({
      issueIdOrKey: ticket.key,
      update: {
        fixVersions: [
          {
            add: { id: versionId },
          },
        ],
      },
    })
    .catch((err) => {
      const allowedStatusCodes = [400, 404];
      let { statusCode } = err;
      if (typeof err === "string") {
        try {
          err = JSON.parse(err);
          statusCode = statusCode || err.statusCode;
        } catch {
          // ignore
        }
      }

      if (allowedStatusCodes.indexOf(statusCode) === -1) {
        logger.error(`Issue '${ticket}' was not added to a release.`, err);
        if (err.response) {
          throw new SemanticReleaseError(err.Response);
        }
        throw new SemanticReleaseError(err);
      }
    })
    .then(() => {
      logger.complete(`Issue '${ticket}' was successfully added to a release.`);
    });
}

export async function success(
  config: PluginConfig,
  context: SuccessContext
): Promise<void> {
  const { env, logger, commits, nextRelease } = context;
  const {
    jiraHost,
    project: projectKey,
    ticketPrefix,
    versionTemplate: definedVersionTemplate,
  } = config;

  const c = CreateJiraClient(logger, jiraHost, env.JIRA_EMAIL, env.JIRA_TOKEN);

  const tickets = await getMentionedTickets(
    c,
    ticketPrefix,
    jiraHost,
    commits,
    logger
  );

  const versionTemplate = _.template(
    definedVersionTemplate || DEFAULT_VERSION_TEMPLATE
  );

  const descriptionTemplate = Handlebars.compile(
    DEFAULT_RELEASE_DESCRIPTION_TEMPLATE
  );

  const newVersionName = versionTemplate({ version: nextRelease.version });
  const newVersionDescription = descriptionTemplate({
    version: newVersionName,
    issues: tickets,
  });

  logger.info(`Using jira release '${newVersionName}'`);
  logger.info(
    `using jira description '${DEFAULT_RELEASE_DESCRIPTION_TEMPLATE}'`
  );

  const project = await c.projects.getProject({ projectIdOrKey: projectKey });
  if (!project.id) {
    throw new SemanticReleaseError("Missing project id!");
  }

  logger.info(
    `Attempting to create new version for project ${project.name}, id: ${project.id}`
  );

  const version = await findOrCreateVersion(
    c,
    project.id,
    newVersionName,
    newVersionDescription,
    logger
  );

  const concurrentLimit = pLimit(10);

  const edits: Promise<void>[] = [];
  for (const ticket of tickets) {
    edits.push(
      concurrentLimit(() =>
        editIssueFixVersions(c, ticket, version.id || "", logger)
      )
    );
  }

  await Promise.all(edits);
}
