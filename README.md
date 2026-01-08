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
      "ondrejbelza/semantic-release-jira",
      {
        "projectId": "MAWI",
        "releaseNameTemplate": "Test v${version}",
        "jiraHost": "maisltep.atlassian.net",
        "ticketPrefixe": "MAWI"
      }
    ]
  ]
}
```

```ts
interface Config {
  /**
   * A domain of a jira instance ie: `mailstep.atlasian.net`
   */
  jiraHost: string;

  /**
   * A prefixe to match when looking for tickets in commits.
   *
   * ie. 'TEST' would match `TEST-123` and `TEST-456`
   */
  ticketPrefix: string;

  /**
   * The id or key for the project releases will be created in
   */
  projectId: string;

  /**
   * A lodash template with a single `version` variable
   * defaults to `v${version}` which results in a version that is named like `v1.0.0`
   * ex: `Semantic Release v${version}` results in `Semantic Release v1.0.0`
   *
   * @default `v${version}`
   */
  releaseNameTemplate?: string;
}
```

semantic release jira releases plugin.
