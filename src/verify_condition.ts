import { VerifyConditionsContext } from "semantic-release";
import SemanticReleaseError from "@semantic-release/error";
import { PluginConfig } from "./types";
import { CreateJiraClient } from "./jira-client";
import { describeJiraError } from "./utils";
import { Version3Client } from "jira.js";

/**
 * 1. verifyConditions
 * Called first to check if the environment is valid (e.g., tokens exist)
 */
export async function verifyConditions(
  pluginConfig: PluginConfig,
  context: VerifyConditionsContext
): Promise<void> {
  const { logger, env } = context;
  const { jiraHost: host, project, ticketPrefixes } = pluginConfig;

  logger.log("Checking conditions for my custom plugin...");

  logger.log("jira host configure to:" + host);

  if (!host) {
    throw new SemanticReleaseError(
      "jira host configuration variable is missing."
    );
  }

  if (!project) {
    throw new SemanticReleaseError(
      "project configuration variable is missing."
    );
  }

  if (!Array.isArray(ticketPrefixes) || ticketPrefixes.length === 0) {
    throw new SemanticReleaseError(
      "ticketPrefixes configuration variable must be a non-empty array."
    );
  }

  if (!env.JIRA_EMAIL) {
    throw new SemanticReleaseError(
      "JIRA_EMAIL environment variable is missing."
    );
  }

  if (!env.JIRA_TOKEN) {
    throw new SemanticReleaseError(
      "JIRA_TOKEN environment variable is missing."
    );
  }

  let c: Version3Client;
  try {
    c = CreateJiraClient(logger, host, env.JIRA_EMAIL, env.JIRA_TOKEN);
  } catch (err: unknown) {
    throw new SemanticReleaseError(
      `Failed to initialise Jira client: ${describeJiraError(err)}`
    );
  }

  try {
    const p = await c.projects.getProject({
      projectIdOrKey: project,
    });
    logger.log("project was found and will be used:" + p.id);
  } catch (err: unknown) {
    throw new SemanticReleaseError(
      `Failed to verify Jira project '${project}': ${describeJiraError(err)}`
    );
  }
}
