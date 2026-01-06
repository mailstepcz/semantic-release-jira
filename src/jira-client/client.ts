import { Version3Client } from "jira.js";
import { Signale } from "signale";

export function CreateJiraClient(
  logger: Signale,
  host: string,
  email: string,
  apiToken: string
): Version3Client {
  logger.info("creating new client v3 with host: " + host);

  const c = new Version3Client({
    host: host,
    authentication: {
      basic: {
        apiToken: apiToken,
        email: email,
      },
    },
  });

  return c;
}
