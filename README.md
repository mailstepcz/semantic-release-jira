# semantic-release-jira plugin

Semantic release jira plugin hooks to semantic release and automatically creates releases in jira and links issues to this release.

## Used hooks

| Hook             | Description                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- |
| verifyConditions | Tries to get project info, throws an exception, when plugin is not configured properly |
| sucess           | creates new jira release and link issue to it                                          |

## Install step

```bash
$ npm install --save-dev @ondrejbelza/semantic-release-jira
$ yarn add --dev @ondrejbelza/semantic-release-jira
```

## Configuration

### Required CI env variables

| Value      | Description                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JIRA_TOKEN | user token that is used for all jira API calls. [Guide How to generate token](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/). |
| JIRA_EMAIL | email of user which generated the token                                                                                                                                            |

#### Required jira permissions

user must have following permissions, otherwise this plugin will not work properly

- get project
- get issue
- modify issue
- create release

### Plugin Configuration

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/git",
    [
      "@ondrejbelza/semantic-release-jira",
      {
        "project": "MAWI",
        "versionTemplate": "Test v${version}",
        "jiraHost": "https://mailstep.atlassian.net",
        "ticketPrefixes": ["MAWI"],
        "typePriority": ["Bug"]
      }
    ]
  ]
}
```

```ts
interface Config {
  /**
   * The full URL of a jira instance, including scheme, ie: `https://mailstep.atlassian.net`
   */
  jiraHost: string;

  /**
   * A list of prefixes to match when looking for tickets in commits.
   *
   * ie. ['TEST'] would match `TEST-123` and `TEST-456`
   */
  ticketPrefixes: string[];

  /**
   * The id or key for the project releases will be created in
   */
  project: string;

  /**
   * A lodash template with a single `version` variable
   * defaults to `v${version}` which results in a version that is named like `v1.0.0`
   * ex: `Semantic Release v${version}` results in `Semantic Release v1.0.0`
   *
   * @default `v${version}`
   */
  versionTemplate?: string;

  /**
   * Ordered list of issue-type names used to group tickets into sections in the
   * release notes. Types listed here appear first, in the given order; any type
   * not listed follows, grouped in the order it first appears in the commits.
   * Matching against Jira's issue-type name is case-insensitive.
   *
   * ie. `['Bug', 'Story']` renders the Bug section first, then Story, then the rest.
   *
   * @default `['Bug']`
   */
  typePriority?: string[];
}
```

## Release notes behavior

- Each ticket is rendered **once**, even when referenced across multiple commits
  (ticket keys are deduplicated, case-insensitively, so `MAWI-1` and `mawi-1` collapse).
- Tickets are grouped by issue type into sections. Section order is controlled by
  `typePriority` (see above); by default the Bug section comes first.

semantic release jira releases plugin.
