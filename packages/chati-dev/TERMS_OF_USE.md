# Chati.dev Terms of Use

Last updated: 2026-03-03

## 1. Acceptance

By installing and using Chati.dev, you agree to these Terms of Use.

## 2. Anonymous Usage Data Collection

Chati.dev collects anonymous usage data by default to improve the product. This includes:

- **Agents used** — which pipeline agents are invoked (e.g., brief, architect, dev)
- **Pipeline duration** — how long each pipeline phase takes
- **Gate scores** — quality gate evaluation scores
- **Circuit breaker events** — when safety mechanisms are triggered
- **Error types** — categorized error codes (no stack traces or file paths)

### What is NOT collected

- No source code, file contents, or file paths
- No personal information (name, email, IP address)
- No project names or repository URLs
- No prompts, conversations, or AI responses

### Anonymous Identification

A random UUID is generated locally for your installation. This ID cannot be traced back to you.

## 3. Opting Out

You can disable telemetry at any time:

```
npx chati-dev telemetry disable
```

You can re-enable it with:

```
npx chati-dev telemetry enable
```

Check current status:

```
npx chati-dev telemetry
```

## 4. Data Handling

Data is sent to Chati.dev telemetry servers and used solely for product improvement. Data is not sold or shared with third parties.

## 5. License

Chati.dev is licensed under the Elastic License 2.0. See LICENSE for full terms.
