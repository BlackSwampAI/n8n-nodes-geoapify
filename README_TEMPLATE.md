# <PACKAGE_DISPLAY_NAME>

<STATUS_BADGES>

<!-- Public packages should normally include npm version, CI, and MIT badges. Private/unavailable packages must omit the npm badge. Delete this comment before release. -->

<ONE_SENTENCE_DESCRIPTION>

> This is an independent Black Swamp AI community integration. It is not affiliated with, endorsed by, sponsored by, or maintained by <SERVICE_OWNER>. Product names and marks belong to their respective owners and are used only to identify compatibility.

[Installation](#installation) · [Compatibility](#compatibility) · [Credentials](#credentials) · [Operations](#operations) · [Usage](#usage) · [Troubleshooting](#troubleshooting) · [Resources](#resources) · [Black Swamp AI](https://blackswampai.com/n8n-nodes/<PACKAGE_SLUG>/)

## Installation

<INSTALLATION_INSTRUCTIONS_FOR_EXACTLY_ONE_DISTRIBUTION_MODE>

<!--
Choose exactly one mode and delete this comment before release:

Verified discovery:
Install the verified community node from the n8n editor: open the nodes panel, search for <SERVICE_NAME>, select **More from the community**, then choose **Install**. Link https://docs.n8n.io/integrations/community-nodes/installation-and-management/install-verified-community-nodes/.

Manual self-hosted Community Nodes:
This package is not currently available through verified-node discovery. On self-hosted n8n, open **Settings → Community Nodes**, select **Install**, and enter `<NPM_PACKAGE_NAME>`. Link https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation/.

Private/unavailable:
State that the package is not publicly installable and do not include npm installation steps. Keep package.json private:true and ensure publication workflows fail closed or are absent.
-->

## Compatibility

| Surface             | Tested baseline                   | Notes                                    |
| ------------------- | --------------------------------- | ---------------------------------------- |
| n8n                 | <MINIMUM_AND_TESTED_N8N_VERSIONS> | <EDITOR_OR_RUNTIME_EVIDENCE>             |
| Service/API         | <TESTED_SERVICE_OR_API_VERSIONS>  | <CLOUD_SELF_HOSTED_OR_EDITION_BOUNDARY>  |
| Node.js development | 22.22.0 and 24                    | CI and package checks run on both lanes. |

Do not present verified-node distribution as evidence of broader service, API, or runtime compatibility.

## Credentials

<AUTHENTICATION_METHODS_AND_LEAST_PRIVILEGE_SETUP>

Delete this section only when the integration genuinely requires no credentials.

## Operations

<IMPLEMENTED_RESOURCES_AND_OPERATIONS_ONLY>

## Usage

<IMPORTANT_MAPPING_PAGINATION_RATE_LIMIT_TRIGGER_OR_DESTRUCTIVE_OPERATION_GUIDANCE>

## Troubleshooting

- Confirm the base URL, account or organization scope, and credential permissions.
- Re-select dynamic list values after changing credentials or a parent selector.
- <SERVICE_SPECIFIC_COMMON_FAILURE_AND_REMEDY>
- Report reproducible defects in [GitHub Issues](https://github.com/<GITHUB_OWNER>/<GITHUB_REPOSITORY>/issues) without including secrets.

## Resources

- [Black Swamp AI package page](https://blackswampai.com/n8n-nodes/<PACKAGE_SLUG>/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Changelog](CHANGELOG.md)
- [Compatibility and testing notes](docs/testing.md)
- <SERVICE_API_DOCUMENTATION_URL>

## License

[MIT](LICENSE.md)
