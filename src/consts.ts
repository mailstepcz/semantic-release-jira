export const DEFAULT_VERSION_TEMPLATE = "v${version}";
export const DEFAULT_RELEASE_DESCRIPTION_TEMPLATE = `# Release notes - {{version}}

## Issues
{{#each issues}}
 - [{{type}}] [{{ key }}]({{ link }}) {{ title }}
   - Short description: {{ description }}
   - Assigned to: {{ assignee }}

{{/each}}

Release notes were automatically generated`;
