import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { fetchIssue } from '../../entry/issue-fetcher.js';

const issueParams = Type.Object({
  source: Type.Union([Type.Literal('github'), Type.Literal('linear'), Type.Literal('freeform')]),
  identifier: Type.String({ description: 'Issue number, Linear ID, or freeform text' }),
  repoRemote: Type.Optional(Type.String({ description: 'Git remote URL for GitHub issues' })),
});

export function createIssueTool(_caseRoot: string): ToolDefinition<typeof issueParams> {
  return {
    name: 'fetch_issue',
    label: 'Issue',
    description: 'Fetch issue details from GitHub, Linear, or create from freeform text',
    promptSnippet: 'Fetch issue details from GitHub or Linear',
    parameters: issueParams,
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const context = await fetchIssue(params.source, params.identifier, params.repoRemote);
      return {
        content: [{ type: 'text', text: `**${context.title}**\n\n${context.body}` }],
        details: context,
      };
    },
  };
}
