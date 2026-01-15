export interface PluginConfig {
  jiraHost: string;
  project: string;
  ticketPrefixes: string[];
  versionTemplate: string;
}

export interface ReleaseCommit {
  author: string;
  message: string;
}

export interface JiraIssue {
  title: string;
  key: string;
  assignee: string;
  type: string;
  description: string;
  link: string;
}

export interface ReleaseContributions {
  commits: ReleaseCommit[];
  issues: JiraIssue[];
}
