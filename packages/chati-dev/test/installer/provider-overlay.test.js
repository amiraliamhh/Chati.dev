import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateProviderOverlays, resolveOverlayPath } from '../../src/installer/provider-overlay.js';
import { ADAPTABLE_FILES } from '../../src/config/framework-adapter.js';

// ---------------------------------------------------------------------------
// generateProviderOverlays
// ---------------------------------------------------------------------------

describe('generateProviderOverlays', () => {
  let tempDir;
  let frameworkSource;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chati-overlay-'));

    // Create a minimal framework source with canonical (Claude) content
    frameworkSource = join(tempDir, 'source');
    mkdirSync(join(frameworkSource, 'orchestrator'), { recursive: true });
    mkdirSync(join(frameworkSource, 'agents', 'build'), { recursive: true });
    mkdirSync(join(frameworkSource, 'context'), { recursive: true });

    writeFileSync(join(frameworkSource, 'orchestrator', 'chati.md'),
      '# Orchestrator\nYou are running in Claude Code.\nRead CLAUDE.md for context.\n/model opus\n', 'utf-8');
    writeFileSync(join(frameworkSource, 'agents', 'build', 'dev.md'),
      '# Dev Agent\n- **Provider**: claude (default)\nClaude Code CLI\n', 'utf-8');
    writeFileSync(join(frameworkSource, 'context', 'root.md'),
      '# Root Context\nCLAUDE.md reference\nCLAUDE.local.md reference\n', 'utf-8');
    writeFileSync(join(frameworkSource, 'constitution.md'),
      '# Constitution\nClaude Code processes\n', 'utf-8');

    // Create chati.dev/ directory (target)
    mkdirSync(join(tempDir, 'chati.dev'), { recursive: true });
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates overlay for 1 secondary provider', () => {
    const result = generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini']);
    assert.deepEqual(result.generated, ['gemini']);
    assert.deepEqual(result.skipped, ['claude']);
  });

  it('generates overlays for 2 secondary providers', () => {
    const result = generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini', 'codex']);
    assert.deepEqual(result.generated, ['gemini', 'codex']);
    assert.deepEqual(result.skipped, ['claude']);
  });

  it('does not generate overlay for primary provider', () => {
    const result = generateProviderOverlays(tempDir, frameworkSource, 'gemini', ['claude', 'gemini']);
    assert.ok(!result.generated.includes('gemini'), 'Primary provider should be skipped');
    assert.ok(result.skipped.includes('gemini'));
    assert.ok(result.generated.includes('claude'));
  });

  it('overlay orchestrator references Gemini CLI (not Claude Code)', () => {
    generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini']);
    const overlayPath = join(tempDir, 'chati.dev', '.adapted', 'gemini', 'orchestrator', 'chati.md');
    assert.ok(existsSync(overlayPath), 'Overlay orchestrator should exist');
    const content = readFileSync(overlayPath, 'utf-8');
    assert.ok(content.includes('Gemini CLI'), 'Should reference Gemini CLI');
    assert.ok(!content.includes('Claude Code'), 'Should not reference Claude Code');
  });

  it('overlay orchestrator has Gemini model names (pro, not opus)', () => {
    generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini']);
    const overlayPath = join(tempDir, 'chati.dev', '.adapted', 'gemini', 'orchestrator', 'chati.md');
    const content = readFileSync(overlayPath, 'utf-8');
    assert.ok(content.includes('/model pro'), 'Should have /model pro');
    assert.ok(!content.includes('/model opus'), 'Should not have /model opus');
  });

  it('overlay context files reference GEMINI.md (not CLAUDE.md)', () => {
    generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini']);
    const overlayPath = join(tempDir, 'chati.dev', '.adapted', 'gemini', 'context', 'root.md');
    assert.ok(existsSync(overlayPath), 'Overlay context file should exist');
    const content = readFileSync(overlayPath, 'utf-8');
    assert.ok(content.includes('GEMINI.md'), 'Should reference GEMINI.md');
    assert.ok(!content.includes('CLAUDE.md'), 'Should not reference CLAUDE.md');
  });

  it('overlay agent files reference correct provider', () => {
    generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'codex']);
    const overlayPath = join(tempDir, 'chati.dev', '.adapted', 'codex', 'agents', 'build', 'dev.md');
    assert.ok(existsSync(overlayPath), 'Overlay agent file should exist');
    const content = readFileSync(overlayPath, 'utf-8');
    assert.ok(content.includes('Codex CLI'), 'Should reference Codex CLI');
    assert.ok(!content.includes('Claude Code'), 'Should not reference Claude Code');
  });

  it('handles missing framework source gracefully', () => {
    const result = generateProviderOverlays(tempDir, '/nonexistent/path', 'claude', ['claude', 'gemini']);
    // Should not throw, just skip files that don't exist
    assert.deepEqual(result.generated, ['gemini']);
  });

  it('returns empty when only one provider', () => {
    const result = generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude']);
    assert.deepEqual(result.generated, []);
    assert.deepEqual(result.skipped, ['claude']);
  });
});

// ---------------------------------------------------------------------------
// resolveOverlayPath
// ---------------------------------------------------------------------------

describe('resolveOverlayPath', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chati-resolve-'));

    // Create main + overlay structures
    mkdirSync(join(tempDir, 'chati.dev', 'orchestrator'), { recursive: true });
    mkdirSync(join(tempDir, 'chati.dev', 'agents', 'build'), { recursive: true });
    mkdirSync(join(tempDir, 'chati.dev', '.adapted', 'gemini', 'orchestrator'), { recursive: true });
    mkdirSync(join(tempDir, 'chati.dev', '.adapted', 'gemini', 'agents', 'build'), { recursive: true });

    writeFileSync(join(tempDir, 'chati.dev', 'orchestrator', 'chati.md'), 'main', 'utf-8');
    writeFileSync(join(tempDir, 'chati.dev', 'agents', 'build', 'dev.md'), 'main-dev', 'utf-8');
    writeFileSync(join(tempDir, 'chati.dev', '.adapted', 'gemini', 'orchestrator', 'chati.md'), 'gemini', 'utf-8');
    writeFileSync(join(tempDir, 'chati.dev', '.adapted', 'gemini', 'agents', 'build', 'dev.md'), 'gemini-dev', 'utf-8');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns overlay path when it exists', () => {
    const result = resolveOverlayPath(tempDir, 'orchestrator/chati.md', 'gemini');
    assert.ok(result.includes('.adapted/gemini'));
    const content = readFileSync(result, 'utf-8');
    assert.equal(content, 'gemini');
  });

  it('returns main path when overlay does not exist', () => {
    const result = resolveOverlayPath(tempDir, 'orchestrator/chati.md', 'codex');
    assert.ok(!result.includes('.adapted'));
    const content = readFileSync(result, 'utf-8');
    assert.equal(content, 'main');
  });

  it('resolves agent files via overlay', () => {
    const result = resolveOverlayPath(tempDir, 'agents/build/dev.md', 'gemini');
    const content = readFileSync(result, 'utf-8');
    assert.equal(content, 'gemini-dev');
  });

  it('falls back for non-overlay files', () => {
    // Templates are not in ADAPTABLE_FILES, so no overlay exists
    const result = resolveOverlayPath(tempDir, 'templates/prd-tmpl.yaml', 'gemini');
    assert.ok(!result.includes('.adapted'), 'Should fall back to main path');
  });
});

// ---------------------------------------------------------------------------
// E2E: multi-provider overlay + prompt builder integration
// ---------------------------------------------------------------------------

describe('E2E multi-provider overlay chain', () => {
  let tempDir;
  let frameworkSource;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chati-e2e-'));

    // Create a realistic framework source with Claude-canonical content
    frameworkSource = join(tempDir, 'source');
    mkdirSync(join(frameworkSource, 'orchestrator'), { recursive: true });
    mkdirSync(join(frameworkSource, 'agents', 'build'), { recursive: true });
    mkdirSync(join(frameworkSource, 'agents', 'discover'), { recursive: true });
    mkdirSync(join(frameworkSource, 'context'), { recursive: true });

    writeFileSync(join(frameworkSource, 'orchestrator', 'chati.md'),
      '# Orchestrator\nYou are running in Claude Code.\nRead CLAUDE.md for context.\n/model opus\n', 'utf-8');
    writeFileSync(join(frameworkSource, 'agents', 'build', 'dev.md'),
      '# Dev Agent\n- **Provider**: claude (default)\nClaude Code CLI\n', 'utf-8');
    writeFileSync(join(frameworkSource, 'agents', 'discover', 'brief.md'),
      '# Brief Agent\nClaude Code\n', 'utf-8');
    writeFileSync(join(frameworkSource, 'context', 'root.md'),
      '# Root Context\nCLAUDE.md reference\nCLAUDE.local.md reference\n', 'utf-8');
    writeFileSync(join(frameworkSource, 'constitution.md'),
      '# Constitution\nClaude Code processes\n', 'utf-8');

    // Create chati.dev/ directory (target)
    mkdirSync(join(tempDir, 'chati.dev'), { recursive: true });
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates overlays for gemini + codex, then resolves correct paths', () => {
    // Step 1: Generate overlays for 2 secondary providers
    const result = generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini', 'codex']);
    assert.deepEqual(result.generated, ['gemini', 'codex']);
    assert.deepEqual(result.skipped, ['claude']);

    // Step 2: Verify Gemini overlay orchestrator is adapted
    const geminiOrch = readFileSync(
      resolveOverlayPath(tempDir, 'orchestrator/chati.md', 'gemini'), 'utf-8'
    );
    assert.ok(geminiOrch.includes('Gemini CLI'), 'Gemini overlay should reference Gemini CLI');
    assert.ok(!geminiOrch.includes('Claude Code'), 'Gemini overlay should not reference Claude Code');

    // Step 3: Verify Codex overlay agent is adapted
    const codexDev = readFileSync(
      resolveOverlayPath(tempDir, 'agents/build/dev.md', 'codex'), 'utf-8'
    );
    assert.ok(codexDev.includes('Codex CLI'), 'Codex overlay should reference Codex CLI');
    assert.ok(!codexDev.includes('Claude Code'), 'Codex overlay should not reference Claude Code');

    // Step 4: Primary (claude) resolves to main path (no overlay)
    const claudeOrch = resolveOverlayPath(tempDir, 'orchestrator/chati.md', 'claude');
    assert.ok(!claudeOrch.includes('.adapted'), 'Claude should use main path');

    // Step 5: Non-adaptable files fall back to main for all providers
    const geminiTemplate = resolveOverlayPath(tempDir, 'templates/prd-tmpl.yaml', 'gemini');
    assert.ok(!geminiTemplate.includes('.adapted'), 'Non-adaptable should fall back to main');
  });

  it('overlay agent files are provider-isolated (no cross-contamination)', () => {
    generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini', 'codex']);

    // Gemini overlay should reference GEMINI.md, not CLAUDE.md or AGENTS.md
    const geminiCtx = readFileSync(
      resolveOverlayPath(tempDir, 'context/root.md', 'gemini'), 'utf-8'
    );
    assert.ok(geminiCtx.includes('GEMINI.md'), 'Gemini should reference GEMINI.md');
    assert.ok(!geminiCtx.includes('CLAUDE.md'), 'Gemini should not reference CLAUDE.md');

    // Codex overlay should reference AGENTS.md, not CLAUDE.md or GEMINI.md
    const codexCtx = readFileSync(
      resolveOverlayPath(tempDir, 'context/root.md', 'codex'), 'utf-8'
    );
    assert.ok(codexCtx.includes('AGENTS.md'), 'Codex should reference AGENTS.md');
    assert.ok(!codexCtx.includes('CLAUDE.md'), 'Codex should not reference CLAUDE.md');
  });

  it('overlay completeness: each secondary has all adaptable source files', () => {
    generateProviderOverlays(tempDir, frameworkSource, 'claude', ['claude', 'gemini']);

    // Count files that exist in source and should exist in overlay
    const sourceFiles = [];
    for (const file of ADAPTABLE_FILES) {
      if (existsSync(join(frameworkSource, file))) {
        sourceFiles.push(file);
      }
    }

    // Every source file should have a gemini overlay
    for (const file of sourceFiles) {
      const overlayPath = join(tempDir, 'chati.dev', '.adapted', 'gemini', file);
      assert.ok(existsSync(overlayPath), `Overlay missing for ${file}`);
    }
  });
});
