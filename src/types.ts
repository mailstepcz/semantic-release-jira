export interface PluginConfig {
  jiraHost: string;
  project: string;
  ticketPrefix: string;
  versionTemplate: string;
}

export interface JiraIssue {
  title: string;
  key: string;
  assignee: string;
  type: string;
  description: string;
  link: string;
}
