import { VerifyConditionsContext } from "semantic-release";
import SemanticReleaseError from "@semantic-release/error";
import { PluginConfig } from "./types";
import { CreateJiraClient } from "./jira-client";

/**
 * 1. verifyConditions
 * Called first to check if the environment is valid (e.g., tokens exist)
 */
export async function verifyConditions(
  pluginConfig: PluginConfig,
  context: VerifyConditionsContext
) {
  const { logger, env } = context;

  logger.log("Checking conditions for my custom plugin...");

  logger.log("jira host configure to:" + pluginConfig.jiraHost);

  if ((pluginConfig.jiraHost = "")) {
    throw new SemanticReleaseError(
      "jira host configuration variable is missing."
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

  const c = CreateJiraClient(
    logger,
    pluginConfig.jiraHost,
    env.JIRA_EMAIL,
    env.JIRA_TOKEN
  );

  const p = await c.projects.getProject({
    projectIdOrKey: pluginConfig.project,
  });

  logger.log("project was found and will be used:" + p.id);
}
