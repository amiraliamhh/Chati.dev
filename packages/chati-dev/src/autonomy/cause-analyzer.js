/**
 * @fileoverview Cause analysis for failed build loop tasks.
 *
 * Analyzes agent output to classify failure categories, detect
 * repetitive patterns, and generate retry guidance.
 *
 * Constitution Article XVII — Execution Mode Governance.
 */

// ---------------------------------------------------------------------------
// Failure Categories
// ---------------------------------------------------------------------------

/**
 * Categories of task failures.
 * @enum {string}
 */
export const FAILURE_CATEGORIES = {
  SYNTAX_ERROR: 'syntax_error',
  TEST_FAILURE: 'test_failure',
  LINT_VIOLATION: 'lint_violation',
  TYPE_ERROR: 'type_error',
  TIMEOUT: 'timeout',
  SCOPE_VIOLATION: 'scope_violation',
  DEPENDENCY: 'dependency',
  RUNTIME_ERROR: 'runtime_error',
  UNKNOWN: 'unknown',
};

/**
 * Patterns for classifying failure output.
 */
const CATEGORY_PATTERNS = [
  { regex: /SyntaxError|Unexpected token|parsing error|unterminated/i, category: FAILURE_CATEGORIES.SYNTAX_ERROR },
  { regex: /test.*fail|assertion.*fail|expect.*receive|expected.*but got/i, category: FAILURE_CATEGORIES.TEST_FAILURE },
  { regex: /lint.*error|eslint|prettier.*error|formatting/i, category: FAILURE_CATEGORIES.LINT_VIOLATION },
  { regex: /TypeError|type.*mismatch|cannot read propert|is not a function/i, category: FAILURE_CATEGORIES.TYPE_ERROR },
  { regex: /timeout|ETIMEDOUT|exceeded.*time|timed out/i, category: FAILURE_CATEGORIES.TIMEOUT },
  { regex: /scope.*violation|cannot write|not allowed.*mode|Article XI/i, category: FAILURE_CATEGORIES.SCOPE_VIOLATION },
  { regex: /Cannot find module|ENOENT|module not found|import.*failed|missing dependency/i, category: FAILURE_CATEGORIES.DEPENDENCY },
  { regex: /ReferenceError|RangeError|Error:|runtime error|ENOMEM/i, category: FAILURE_CATEGORIES.RUNTIME_ERROR },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze the cause of a task failure.
 *
 * @param {string} output - Agent output/error text
 * @param {Array<{category: string, output: string}>} [previousAttempts=[]] - History of prior attempts
 * @returns {{ category: string, rootCause: string, suggestion: string, isRepetitive: boolean }}
 */
export function analyzeCause(output, previousAttempts = []) {
  const text = output || '';
  const category = classifyOutput(text);
  const rootCause = extractRootCause(text, category);
  const suggestion = generateSuggestion(category, rootCause);
  const isRepetitive = checkRepetitive(category, previousAttempts);

  return { category, rootCause, suggestion, isRepetitive };
}

/**
 * Build retry guidance for the next attempt based on cause analysis.
 *
 * @param {{ category: string, rootCause: string, suggestion: string, isRepetitive: boolean }} analysis
 * @param {number} attempt - Current attempt number
 * @returns {string} Guidance text for the agent
 */
export function buildRetryGuidance(analysis, attempt) {
  const parts = [];

  parts.push(`## Retry Guidance (Attempt ${attempt})`);
  parts.push('');
  parts.push(`**Previous failure**: ${analysis.category}`);

  if (analysis.rootCause) {
    parts.push(`**Root cause**: ${analysis.rootCause}`);
  }

  parts.push(`**Suggestion**: ${analysis.suggestion}`);

  if (analysis.isRepetitive) {
    parts.push('');
    parts.push('**WARNING**: This is a REPETITIVE failure. The same category of error occurred in previous attempts.');
    parts.push('You MUST try a fundamentally different approach — do not repeat the same fix.');
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Classify output text into a failure category.
 *
 * @param {string} text
 * @returns {string}
 */
function classifyOutput(text) {
  for (const { regex, category } of CATEGORY_PATTERNS) {
    if (regex.test(text)) {
      return category;
    }
  }
  return FAILURE_CATEGORIES.UNKNOWN;
}

/**
 * Extract a concise root cause from the output.
 *
 * @param {string} text
 * @param {string} category
 * @returns {string}
 */
function extractRootCause(text, category) {
  if (!text) return 'No output available';

  // Try to find the most informative error line
  const lines = text.split('\n').filter(l => l.trim());

  // Look for lines containing "Error:" or similar markers
  const errorLine = lines.find(l =>
    /error:|Error:|ERR!|FAIL|failed/i.test(l)
  );

  if (errorLine) {
    return errorLine.trim().slice(0, 200);
  }

  // Fall back to last non-empty line (often the summary)
  if (lines.length > 0) {
    return lines[lines.length - 1].trim().slice(0, 200);
  }

  return `${category} detected (no specific error line found)`;
}

/**
 * Generate a suggestion based on the failure category.
 *
 * @param {string} category
 * @param {string} rootCause
 * @returns {string}
 */
function generateSuggestion(category, rootCause) {
  const suggestions = {
    [FAILURE_CATEGORIES.SYNTAX_ERROR]: 'Check for missing brackets, semicolons, or malformed expressions. Review the exact line mentioned in the error.',
    [FAILURE_CATEGORIES.TEST_FAILURE]: 'Review the failing test assertions. Ensure the implementation matches the expected behavior described in the test.',
    [FAILURE_CATEGORIES.LINT_VIOLATION]: 'Fix formatting and style issues. Check import ordering, unused variables, and indentation.',
    [FAILURE_CATEGORIES.TYPE_ERROR]: 'Verify that variable types match expected types. Check for null/undefined access and incorrect function signatures.',
    [FAILURE_CATEGORIES.TIMEOUT]: 'The operation took too long. Consider optimizing the approach or breaking the task into smaller pieces.',
    [FAILURE_CATEGORIES.SCOPE_VIOLATION]: 'The write operation is outside the allowed scope for the current mode. Only modify files within the permitted directories.',
    [FAILURE_CATEGORIES.DEPENDENCY]: 'A required module or dependency is missing. Ensure all imports reference existing files and packages are installed.',
    [FAILURE_CATEGORIES.RUNTIME_ERROR]: 'A runtime error occurred during execution. Check for logic errors, invalid operations, and edge cases.',
    [FAILURE_CATEGORIES.UNKNOWN]: 'Review the full output to identify the issue. The error does not match known patterns.',
  };

  return suggestions[category] || suggestions[FAILURE_CATEGORIES.UNKNOWN];
}

/**
 * Check if the same failure category appeared in previous attempts.
 *
 * @param {string} category
 * @param {Array<{category: string}>} previousAttempts
 * @returns {boolean}
 */
function checkRepetitive(category, previousAttempts) {
  if (category === FAILURE_CATEGORIES.UNKNOWN) return false;
  const sameCategory = previousAttempts.filter(a => a.category === category);
  return sameCategory.length >= 2;
}
