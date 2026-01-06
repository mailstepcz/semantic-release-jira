import { Version3Client } from "jira.js";

export function CreateJiraClient(
  host: string,
  email: string,
  apiToken: string
): Version3Client {
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
