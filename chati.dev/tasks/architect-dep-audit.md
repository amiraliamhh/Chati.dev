---
id: architect-dep-audit
agent: architect
trigger: architect-stack-selection
phase: plan
requires_input: false
parallelizable: false
outputs: [dep-audit.yaml]
handoff_to: architect-api-design
autonomous_gate: true
criteria:
  - All chosen dependencies verified against vulnerability databases
  - No critical or high severity CVEs at selected versions
  - No deprecated packages in the stack
  - Peer dependency compatibility confirmed
  - License compliance verified (no GPL in proprietary projects)
---
# Dependency Audit (Greenfield)

## Purpose
Verify that the technology stack chosen in `architect-stack-selection` has no known vulnerabilities, deprecated packages, or compatibility issues BEFORE implementation begins.

This prevents the scenario where `npm install` on day 1 reveals critical vulnerabilities that require breaking changes to resolve.

## Prerequisites
- `stack-selection.yaml` exists with chosen technologies and versions
- Version verification from stack-selection completed

## Steps

### 1. Generate Dependency Manifest
From `stack-selection.yaml`, create a virtual dependency list:
- Extract all packages with their chosen versions
- Include both production and development dependencies
- Include peer dependencies implied by framework choices

### 2. Check Vulnerabilities
For each dependency at the chosen version:
- Query known CVE databases (npm audit, GitHub Advisory Database)
- Check for known security advisories
- Classify findings by severity: critical, high, moderate, low

```yaml
# Example finding
- package: "lodash"
  version: "4.17.15"
  vulnerability:
    id: "CVE-2021-23337"
    severity: high
    description: "Prototype pollution in lodash"
    fixed_in: "4.17.21"
    recommendation: "Upgrade to 4.17.21+"
```

### 3. Verify Deprecation Status
For each dependency:
- Check if the package is deprecated on its registry
- Check if the chosen version is in an unsupported/EOL branch
- Flag packages with no updates in > 12 months (potential abandonment)

### 4. Verify Peer Dependency Compatibility
- Check that all chosen packages are compatible with each other at selected versions
- Verify Node.js runtime compatibility
- Verify TypeScript version compatibility across packages
- Flag any known conflicts between chosen packages

### 5. Check License Compliance
- Extract license for each dependency
- Flag GPL/AGPL dependencies in proprietary projects
- Flag any license that requires attribution and document it
- Flag packages with no license specified

### 6. Generate Audit Report

## Output Format
```yaml
# dep-audit.yaml
audit:
  status: clean | warnings | blocked
  audited_at: "{ISO timestamp}"
  stack_source: stack-selection.yaml

  summary:
    total_packages: 0
    vulnerabilities:
      critical: 0
      high: 0
      moderate: 0
      low: 0
    deprecated: 0
    incompatible: 0
    license_issues: 0

  findings: []
  # Each finding:
  # - package: "{name}"
  #   version: "{chosen version}"
  #   category: vulnerability | deprecated | incompatible | license
  #   severity: critical | high | moderate | low | info
  #   description: "{what's wrong}"
  #   recommendation: "{what to do}"
  #   alternative: "{alternative package if applicable}"

  recommendations:
    version_pins: []
    # Specific version pins that resolve issues
    package_swaps: []
    # Alternative packages if current choice is problematic

  decision_required: true | false
  # true if any critical/high findings need user decision before proceeding
```

## Gate Criteria
- **PASS**: 0 critical, 0 high vulnerabilities; 0 deprecated packages; all peer deps compatible
- **WARN**: moderate vulnerabilities exist (document and proceed)
- **BLOCK**: critical or high vulnerabilities, deprecated packages, or incompatible peer deps

If BLOCKED:
1. Present findings to user with alternatives
2. User must approve resolution (upgrade version, swap package, accept risk)
3. Update `stack-selection.yaml` with approved changes
4. Re-run audit to verify resolution

## Notes
- This task runs BEFORE implementation, saving the user from discovering issues after scaffolding
- Pattern adapted from `brownfield-wu-dependency-scan` (simplified for greenfield where no lock file exists yet)
- If web search or context7 MCP is available, use them for real-time CVE lookups
