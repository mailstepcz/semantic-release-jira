import { PluginConfig } from "./types";
import { SuccessContext, Commit } from "semantic-release";
import { escapeRegExp } from "./utils";
import { Signale } from "signale";
import * as _ from "lodash";
import {
  DEFAULT_RELEASE_DESCRIPTION_TEMPLATE,
  DEFAULT_VERSION_TEMPLATE,
} from "./consts";
import { CreateJiraClient } from "./jira-client";
import { Version3Client } from "jira.js";
import { Version } from "jira.js/version3/models/version";
import pLimit from "p-limit";
import SemanticReleaseError from "@semantic-release/error";

function getMentionedTickets(
  ticketPrefix: string,
  commits: readonly Commit[],
  logger: Signale
): string[] {
  const tickets = new Set<string>();

  const pattern = new RegExp(
    `\\b${escapeRegExp(ticketPrefix)}-(\\d+)\\b`,
    "giu"
  );

  for (const commit of commits) {
    const matches = commit.message.match(pattern);
    if (matches) {
      for (const match of matches) {
        tickets.add(match);
        logger.info(
          `Found matching ticket it commit ${match} in ${commit.commit.short}`
        );
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
    const version = await c.projectVersions.createVersion({
      name: newVersionName,
      description: newVersionDescription,
      projectId: projectIdOrKey as any,
      released: true,
      releaseDate: new Date().toISOString(),
      archived: false,
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
  ticket: string,
  versionId: string,
  logger: Signale
): Promise<void> {
  logger.info(`Adding issue '${ticket}' to a release '${versionId}'`);
  c.issues
    .editIssue({
      issueIdOrKey: ticket,
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

  const tickets = getMentionedTickets(ticketPrefix, commits, logger);

  const versionTemplate = _.template(
    definedVersionTemplate || DEFAULT_VERSION_TEMPLATE
  );

  const newVersionName = versionTemplate({ version: nextRelease.version });
  const newVersionDescription = DEFAULT_RELEASE_DESCRIPTION_TEMPLATE;

  logger.info(`Using jira release '${newVersionName}'`);
  logger.info(
    `using jira description '${DEFAULT_RELEASE_DESCRIPTION_TEMPLATE}'`
  );

  const c = CreateJiraClient(logger, jiraHost, env.JIRA_EMAIL, env.JIRA_TOKEN);

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
