import * as p from '@clack/prompts';
import { t, SUPPORTED_LANGUAGES, loadLanguage } from './i18n.js';
import { detectProjectType } from '../utils/detector.js';
import { showSummary, showChecklist } from './feedback.js';
import { brand, dim, success } from '../utils/colors.js';
import { isProviderAvailable } from '../terminal/cli-registry.js';
import { IDE_CONFIGS, IDE_TO_PROVIDER } from '../config/ide-configs.js';

/**
 * Step 1: Language Selection (always in English)
 */
export async function stepLanguage() {
  const language = await p.select({
    message: 'Select your language:',
    options: SUPPORTED_LANGUAGES.map(lang => ({
      value: lang.value,
      label: lang.label,
    })),
  });

  if (p.isCancel(language)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  // Load i18n strings from this point forward
  loadLanguage(language);

  return language;
}

/**
 * Step 2: Project Type
 */
export async function stepProjectType(targetDir) {
  const detection = detectProjectType(targetDir);

  if (detection.suggestion === 'brownfield' && detection.confidence !== 'low') {
    p.note(
      `${success('✓')} ${t('installer.detected_brownfield')}\n${t('installer.suggestion_brownfield')}`,
      dim('Auto-detection')
    );
  }

  const projectType = await p.select({
    message: t('installer.project_type'),
    options: [
      { value: 'greenfield', label: t('installer.greenfield') },
      { value: 'brownfield', label: t('installer.brownfield') },
    ],
    initialValue: detection.suggestion,
  });

  if (p.isCancel(projectType)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  return projectType;
}

/**
 * Provider display names for confirmation and selection prompts.
 */
const PROVIDER_DISPLAY_NAMES = {
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  codex: 'Codex (OpenAI)',
};

/**
 * Step 3a: Provider Selection (multi-select)
 *
 * Asks the user which AI providers they want to use (Claude, Gemini, Codex).
 * Returns an array of provider names (e.g. ['claude', 'gemini']).
 */
export async function stepProviderSelection() {
  const cliIDEs = Object.entries(IDE_CONFIGS).filter(([, c]) => c.group === 'cli');
  const options = [];

  for (const [key, config] of cliIDEs) {
    const provider = IDE_TO_PROVIDER[key];
    let installed;
    try {
      installed = provider ? await isProviderAvailable(provider) : false;
    } catch {
      installed = key === 'claude-code';
    }
    const suffix = !installed ? ` ${dim(t('installer.llm_provider_not_installed'))}` : '';
    const providerName = PROVIDER_DISPLAY_NAMES[provider] || config.name;
    options.push({
      value: provider,
      label: `${providerName}${config.recommended ? ' (Recommended)' : ''}${suffix}`,
      hint: config.description,
    });
  }

  const selected = await p.multiselect({
    message: `${t('installer.provider_selection_title')} ${dim('(space to select, enter to confirm)')}`,
    options,
    required: true,
  });

  if (p.isCancel(selected)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  return selected;
}

/**
 * Step 3b: Editor Selection (multi-select, optional)
 *
 * Asks the user which editor IDEs should receive rules files.
 * Returns an array of IDE keys (e.g. ['vscode', 'cursor']).
 */
export async function stepEditorSelection() {
  const editorIDEs = Object.entries(IDE_CONFIGS).filter(([, c]) => c.group === 'editor');

  if (editorIDEs.length === 0) return [];

  const options = editorIDEs.map(([key, config]) => ({
    value: key,
    label: config.name,
    hint: config.description,
  }));

  const selected = await p.multiselect({
    message: `${t('installer.editor_selection_title')} ${dim('(space to select, enter to confirm)')}`,
    options,
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  return selected;
}

/**
 * Step 3: IDE / CLI Selection (multi-select) — LEGACY
 *
 * Maintained for backward compatibility. Combines providers and editors in a single prompt.
 * Users select which IDEs/CLIs they'll use; CLI providers are derived from selections.
 */
export async function stepIDESelection() {
  // Check availability of CLI-based IDEs
  const cliIDEs = Object.entries(IDE_CONFIGS).filter(([, c]) => c.group === 'cli').map(([k]) => k);
  const availability = {};
  for (const ide of cliIDEs) {
    const provider = IDE_TO_PROVIDER[ide];
    try {
      availability[ide] = provider ? await isProviderAvailable(provider) : false;
    } catch {
      availability[ide] = ide === 'claude-code';
    }
  }

  // Build options with visual group separators
  const options = [];

  // CLI providers first (spawn terminals, enable multi-provider continuity)
  options.push({ value: '_cli_header', label: dim('── CLI Providers (spawn agent terminals) ──'), hint: '', disabled: true });
  for (const [key, config] of Object.entries(IDE_CONFIGS)) {
    if (config.group !== 'cli') continue;
    const installed = availability[key];
    const suffix = !installed ? ` ${dim(t('installer.llm_provider_not_installed'))}` : '';
    options.push({
      value: key,
      label: `${config.name}${config.recommended ? ' (Recommended)' : ''}${suffix}`,
      hint: config.description,
    });
  }

  // Editor IDEs (rules files only, no terminal spawning)
  options.push({ value: '_editor_header', label: dim('── Editor IDEs (rules integration) ──'), hint: '', disabled: true });
  for (const [key, config] of Object.entries(IDE_CONFIGS)) {
    if (config.group !== 'editor') continue;
    options.push({
      value: key,
      label: config.name,
      hint: config.description,
    });
  }

  const selectedIDEs = await p.multiselect({
    message: `${t('installer.ide_selection_title')} ${dim('(space to select, enter to confirm)')}`,
    options,
    required: true,
  });

  if (p.isCancel(selectedIDEs)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  // Filter out separator headers
  return selectedIDEs.filter(id => !id.startsWith('_'));
}

/**
 * Step 3b: Primary CLI Provider Selection
 *
 * Only shown when the user selected multiple CLI-based IDEs.
 * Determines which provider's adapted files go in chati.dev/ (main).
 */
export async function stepPrimaryProvider(cliProviders) {
  if (cliProviders.length <= 1) return cliProviders[0] || 'claude';

  const primary = await p.select({
    message: t('installer.primary_provider_title'),
    options: cliProviders.map(prov => ({
      value: prov,
      label: PROVIDER_DISPLAY_NAMES[prov] || prov,
    })),
  });

  if (p.isCancel(primary)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  return primary;
}

/**
 * Step 4: Confirmation
 */
export async function stepConfirmation(config) {
  const { projectName, projectType, language, llmProvider, selectedMCPs, selectedIDEs, allProviders } = config;

  const langName = SUPPORTED_LANGUAGES.find(l => l.value === language)?.label || language;

  // Show all providers with primary indicator
  const providers = allProviders || [llmProvider || 'claude'];
  const providersDisplay = providers.map(prov => {
    const name = PROVIDER_DISPLAY_NAMES[prov] || prov;
    return prov === llmProvider ? `${name} (Primary)` : name;
  }).join(', ');

  // Separate editors from CLI IDEs for display
  const editorIDEs = (selectedIDEs || []).filter(id => IDE_CONFIGS[id]?.group === 'editor');
  const editorNames = editorIDEs.length > 0
    ? editorIDEs.map(id => IDE_CONFIGS[id]?.name || id).join(', ')
    : 'None';
  const mcpNames = selectedMCPs.length > 0
    ? `${selectedMCPs.join(', ')} (auto-installed)`
    : 'None';

  const summaryData = {
    [t('installer.project_label')]: `${projectName} (${projectType === 'greenfield' ? 'Greenfield' : 'Brownfield'})`,
    [t('installer.language_label')]: langName,
    [t('installer.providers_label')]: providersDisplay,
  };

  // Only show editor IDEs line if any were selected
  if (editorIDEs.length > 0) {
    summaryData[t('installer.ides_label')] = editorNames;
  }

  summaryData[t('installer.mcps_label')] = mcpNames;

  console.log();
  console.log(brand(t('installer.confirmation_title') + ':'));
  showSummary(summaryData);

  console.log();
  console.log(`  ${t('installer.will_install')}:`);
  showChecklist([
    t('installer.agents_count'),
    t('installer.workflows_count'),
    t('installer.templates_count'),
    t('installer.constitution'),
    t('installer.session_mgmt'),
    t('installer.quality_gates'),
  ]);

  console.log();
  console.log(`  ${dim('Target:')} ${config.targetDir}`);

  const proceed = await p.confirm({
    message: t('installer.proceed'),
    initialValue: true,
  });

  if (p.isCancel(proceed) || !proceed) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  return true;
}

/**
 * Step 5: Telemetry Consent (opt-in)
 *
 * Asks the user if they want to share anonymous usage metrics.
 * Returns true (opt-in) or false (opt-out).
 */
export async function stepTelemetryConsent() {
  p.note(
    `${dim(t('installer.telemetry_description'))}\n\n${dim(t('installer.telemetry_privacy'))}`,
    dim('Telemetry')
  );

  const consent = await p.confirm({
    message: t('installer.telemetry_consent'),
    initialValue: true,
  });

  if (p.isCancel(consent)) return false;

  return consent;
}
