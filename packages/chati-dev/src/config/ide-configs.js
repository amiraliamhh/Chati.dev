/**
 * IDE Configuration Mapping (7 IDEs)
 * Defines where chati.dev agents are deployed per IDE
 */
export const IDE_CONFIGS = {
  'claude-code': {
    name: 'Claude Code',
    description: 'Anthropic official CLI',
    group: 'cli',
    recommended: true,
    configPath: '.claude/commands/',
    rulesFile: '.claude/CLAUDE.md',
    mcpConfigFile: '.claude/mcp.json',
    formatNotes: 'Native markdown format',
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    description: 'Google AI terminal agent',
    group: 'cli',
    recommended: false,
    configPath: '.gemini/commands/',
    rulesFile: 'GEMINI.md',
    mcpConfigFile: '.gemini/settings.json',
    formatNotes: 'TOML command format',
    contextPath: '.gemini/context/',
    hooksPath: '.gemini/hooks/',
  },
  'codex-cli': {
    name: 'Codex CLI',
    description: 'OpenAI Codex terminal agent',
    group: 'cli',
    recommended: false,
    configPath: '.agents/skills/chati/',
    rulesFile: 'AGENTS.md',
    mcpConfigFile: null,
    formatNotes: 'Codex skill format (SKILL.md with YAML frontmatter)',
    rulesPath: '.codex/rules/',
    overrideFile: 'AGENTS.override.md',
  },
  'vscode': {
    name: 'VS Code',
    description: 'Extensions: Continue, Copilot Chat, etc',
    group: 'editor',
    recommended: false,
    configPath: '.vscode/chati/',
    rulesFile: '.vscode/chati/rules.md',
    mcpConfigFile: null,
    formatNotes: 'Markdown with VS Code extension support',
  },
  'cursor': {
    name: 'Cursor',
    description: 'AI-first code editor',
    group: 'editor',
    recommended: false,
    configPath: '.cursor/rules/',
    rulesFile: '.cursorrules',
    mcpConfigFile: null,
    formatNotes: 'Cursor rules format',
  },
  'windsurf': {
    name: 'Windsurf',
    description: 'AI-powered code editor by Codeium',
    group: 'editor',
    recommended: false,
    configPath: '.windsurf/rules/',
    rulesFile: '.windsurfrules',
    mcpConfigFile: null,
    formatNotes: 'Windsurf rules format (markdown)',
  },
  'antigravity': {
    name: 'AntiGravity',
    description: 'Google agentic development platform',
    group: 'editor',
    recommended: false,
    configPath: '.antigravity/agents/',
    rulesFile: '.antigravity/rules.md',
    mcpConfigFile: null,
    formatNotes: 'Google platform format',
  },
};

/**
 * Map IDE key to its CLI provider name.
 * Editor-based IDEs (vscode, cursor, windsurf, antigravity) don't have a CLI provider.
 */
export const IDE_TO_PROVIDER = {
  'claude-code': 'claude',
  'gemini-cli': 'gemini',
  'codex-cli': 'codex',
  'vscode': null,
  'cursor': null,
  'windsurf': null,
  'antigravity': null,
};

/**
 * Get list of IDEs for selection prompt
 */
export function getIDEChoices() {
  return Object.entries(IDE_CONFIGS).map(([key, config]) => ({
    value: key,
    label: `${config.name}${config.recommended ? ' (Recommended)' : ''}`,
    hint: config.description,
  }));
}
