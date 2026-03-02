/**
 * @fileoverview Real code execution validation.
 *
 * Detects test runners, executes tests and lint commands,
 * and parses output for structured results.
 *
 * Constitution Article XIV — Framework Registry Governance.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Test Runner Detection
// ---------------------------------------------------------------------------

/**
 * @typedef {object} TestDetection
 * @property {string|null} command - Test command to run
 * @property {string} runner - Detected runner name (node:test|jest|vitest|mocha|unknown)
 * @property {boolean} detected - Whether a test setup was found
 */

/**
 * Detect the test command and runner for a project.
 *
 * Detection order:
 * 1. package.json scripts.test
 * 2. vitest.config.* presence
 * 3. jest.config.* presence
 * 4. .mocharc.* presence
 *
 * @param {string} projectDir - Project root directory
 * @returns {TestDetection}
 */
export function detectTestCommand(projectDir) {
  const pkgPath = join(projectDir, 'package.json');

  // Check package.json scripts.test
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const testScript = pkg.scripts?.test;

      if (testScript && testScript !== 'echo "Error: no test specified" && exit 1') {
        const runner = detectRunnerFromScript(testScript);
        return { command: 'npm test', runner, detected: true };
      }
    } catch {
      // Malformed package.json — continue detection
    }
  }

  // Check for vitest.config.*
  const vitestConfigs = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'];
  for (const cfg of vitestConfigs) {
    if (existsSync(join(projectDir, cfg))) {
      return { command: 'npx vitest run', runner: 'vitest', detected: true };
    }
  }

  // Check for jest.config.*
  const jestConfigs = ['jest.config.ts', 'jest.config.js', 'jest.config.json'];
  for (const cfg of jestConfigs) {
    if (existsSync(join(projectDir, cfg))) {
      return { command: 'npx jest', runner: 'jest', detected: true };
    }
  }

  // Check for .mocharc.*
  const mochaConfigs = ['.mocharc.yml', '.mocharc.yaml', '.mocharc.json', '.mocharc.js'];
  for (const cfg of mochaConfigs) {
    if (existsSync(join(projectDir, cfg))) {
      return { command: 'npx mocha', runner: 'mocha', detected: true };
    }
  }

  return { command: null, runner: 'unknown', detected: false };
}

/**
 * Detect runner from a test script string.
 *
 * @param {string} script
 * @returns {string}
 */
function detectRunnerFromScript(script) {
  if (/node\s+--test/.test(script)) return 'node:test';
  if (/vitest/.test(script)) return 'vitest';
  if (/jest/.test(script)) return 'jest';
  if (/mocha/.test(script)) return 'mocha';
  if (/tap/.test(script)) return 'tap';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------

/**
 * @typedef {object} TestResult
 * @property {boolean} success - All tests passed
 * @property {number} total - Total test count
 * @property {number} passed - Tests passed
 * @property {number} failed - Tests failed
 * @property {number} skipped - Tests skipped
 * @property {number} duration - Execution time in ms
 * @property {string} rawOutput - Full command output
 * @property {string} runner - Detected runner
 */

/**
 * Run tests in a project directory.
 *
 * @param {string} projectDir
 * @param {{ timeout?: number, command?: string }} [options={}]
 * @returns {TestResult}
 */
export function runTests(projectDir, options = {}) {
  const detection = detectTestCommand(projectDir);
  const command = options.command || detection.command;
  const timeout = options.timeout || 120_000;

  if (!command) {
    return {
      success: false,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      rawOutput: 'No test command detected',
      runner: 'unknown',
    };
  }

  const start = Date.now();
  let rawOutput = '';
  let exitCode = 0;

  try {
    rawOutput = execSync(command, {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    exitCode = err.status || 1;
    rawOutput = (err.stdout || '') + (err.stderr || '');
  }

  const duration = Date.now() - start;
  const parsed = parseTestOutput(rawOutput, detection.runner);

  return {
    success: exitCode === 0 && parsed.failed === 0,
    total: parsed.total,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    duration,
    rawOutput: rawOutput.slice(0, 5000),
    runner: detection.runner,
  };
}

// ---------------------------------------------------------------------------
// Lint Execution
// ---------------------------------------------------------------------------

/**
 * @typedef {object} LintResult
 * @property {boolean} success - No lint errors
 * @property {number} errors - Error count
 * @property {number} warnings - Warning count
 * @property {string} rawOutput - Full command output
 */

/**
 * Run lint in a project directory.
 *
 * @param {string} projectDir
 * @param {{ timeout?: number, command?: string }} [options={}]
 * @returns {LintResult}
 */
export function runLint(projectDir, options = {}) {
  const timeout = options.timeout || 60_000;
  let command = options.command;

  // Auto-detect lint command
  if (!command) {
    const pkgPath = join(projectDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.lint) {
          command = 'npm run lint';
        }
      } catch {
        // ignore
      }
    }
  }

  if (!command) {
    return { success: true, errors: 0, warnings: 0, rawOutput: 'No lint command detected' };
  }

  let rawOutput = '';
  let exitCode = 0;

  try {
    rawOutput = execSync(command, {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    exitCode = err.status || 1;
    rawOutput = (err.stdout || '') + (err.stderr || '');
  }

  const { errors, warnings } = parseLintOutput(rawOutput);

  return {
    success: exitCode === 0 && errors === 0,
    errors,
    warnings,
    rawOutput: rawOutput.slice(0, 5000),
  };
}

// ---------------------------------------------------------------------------
// Output Parsing
// ---------------------------------------------------------------------------

/**
 * Parse test output to extract counts.
 *
 * @param {string} output
 * @param {string} runner
 * @returns {{ total: number, passed: number, failed: number, skipped: number }}
 */
export function parseTestOutput(output, runner) {
  if (!output) {
    return { total: 0, passed: 0, failed: 0, skipped: 0 };
  }

  switch (runner) {
    case 'node:test':
      return parseNodeTestOutput(output);
    case 'jest':
      return parseJestOutput(output);
    case 'vitest':
      return parseVitestOutput(output);
    case 'mocha':
      return parseMochaOutput(output);
    default:
      return parseGenericOutput(output);
  }
}

/**
 * Parse node:test TAP-like output.
 */
function parseNodeTestOutput(output) {
  const testsMatch = output.match(/# tests (\d+)/);
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);
  const skipMatch = output.match(/# skipped (\d+)/);

  const total = testsMatch ? parseInt(testsMatch[1], 10) : 0;
  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;

  return { total, passed, failed, skipped };
}

/**
 * Parse Jest output.
 */
function parseJestOutput(output) {
  // Jest format: "Tests:  3 failed, 47 passed, 50 total"
  const totalMatch = output.match(/(\d+)\s+total/);
  const passedMatch = output.match(/(\d+)\s+passed/);
  const failMatch = output.match(/(\d+)\s+failed/);
  const skipMatch = output.match(/(\d+)\s+skipped/);

  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;

  return { total, passed, failed, skipped };
}

/**
 * Parse Vitest output.
 */
function parseVitestOutput(output) {
  const passMatch = output.match(/(\d+)\s+passed/);
  const failMatch = output.match(/(\d+)\s+failed/);
  const skipMatch = output.match(/(\d+)\s+skipped/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;
  const total = passed + failed + skipped;

  return { total, passed, failed, skipped };
}

/**
 * Parse Mocha output.
 */
function parseMochaOutput(output) {
  const passMatch = output.match(/(\d+)\s+passing/);
  const failMatch = output.match(/(\d+)\s+failing/);
  const pendMatch = output.match(/(\d+)\s+pending/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skipped = pendMatch ? parseInt(pendMatch[1], 10) : 0;
  const total = passed + failed + skipped;

  return { total, passed, failed, skipped };
}

/**
 * Generic fallback parser.
 */
function parseGenericOutput(output) {
  const passMatch = output.match(/(\d+)\s+pass/i);
  const failMatch = output.match(/(\d+)\s+fail/i);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const total = passed + failed;

  return { total, passed, failed, skipped: 0 };
}

/**
 * Parse lint output for error/warning counts.
 *
 * @param {string} output
 * @returns {{ errors: number, warnings: number }}
 */
function parseLintOutput(output) {
  // ESLint format: "X problems (Y errors, Z warnings)"
  const eslintMatch = output.match(/(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/);
  if (eslintMatch) {
    return {
      errors: parseInt(eslintMatch[2], 10),
      warnings: parseInt(eslintMatch[3], 10),
    };
  }

  // Count error/warning lines
  const errorLines = (output.match(/error/gi) || []).length;
  const warningLines = (output.match(/warning/gi) || []).length;

  return { errors: errorLines, warnings: warningLines };
}
