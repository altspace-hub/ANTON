import type { DatabaseAdapter } from '../db/database.js';

// ── Types ──────────────────────────────────────────────────

export type ScriptTier = 'lite' | 'medium';
export type AppType = 'react' | 'html' | 'python-cli' | 'node-api';

export interface PromptPair {
  systemPrompt: string;
  userMessage: string;
}

export interface ParsedScript {
  script: string;
  explanation: string;
  dependencies: string[];
}

export interface ParsedFile {
  path: string;
  content: string;
  language: string;
}

// ── Factory ────────────────────────────────────────────────

export async function createCodingEngine(db: DatabaseAdapter) {

  // ── APP TYPE METADATA ──────────────────────────────────────

  const APP_TYPE_META: Record<AppType, {
    label: string;
    stack: string;
    entryFile: string;
    dependencyFile: string;
    buildCommand: string;
    runCommand: string;
  }> = {
    react: {
      label: 'React Single-Page Application',
      stack: 'React 18+, TypeScript, Tailwind CSS, Vite',
      entryFile: 'src/App.tsx',
      dependencyFile: 'package.json',
      buildCommand: 'npm install && npm run dev',
      runCommand: 'npm run dev',
    },
    html: {
      label: 'Vanilla HTML/CSS/JS Application',
      stack: 'HTML5, CSS3 (flexbox/grid), ES6+ JavaScript',
      entryFile: 'index.html',
      dependencyFile: '(none — no build step)',
      buildCommand: '(none)',
      runCommand: 'Open index.html in a browser',
    },
    'python-cli': {
      label: 'Python CLI Application',
      stack: 'Python 3.10+, argparse or click, rich (optional)',
      entryFile: 'main.py',
      dependencyFile: 'requirements.txt',
      buildCommand: 'pip install -r requirements.txt',
      runCommand: 'python main.py --help',
    },
    'node-api': {
      label: 'Node.js REST API',
      stack: 'Node.js 18+, Express.js, TypeScript (optional)',
      entryFile: 'server.js or src/index.ts',
      dependencyFile: 'package.json',
      buildCommand: 'npm install',
      runCommand: 'npm start',
    },
  };

  // ═══════════════════════════════════════════════════════════
  // 1. buildClarifyPrompt
  // ═══════════════════════════════════════════════════════════

  /**
   * Builds a prompt pair that asks Claude to generate 3-5 clarifying questions
   * for a script/app generation request. The frontend sends this through the
   * standard POST /api/claude/message route.
   *
   * Returns { systemPrompt, userMessage } — NOT a direct Claude API call.
   */
  function buildClarifyPrompt(
    description: string,
    dataSample?: string,
    tier: ScriptTier = 'lite',
  ): PromptPair {
    const liteTopics = `Focus your questions on:
- **Input format**: What data format does the script expect? (CSV, JSON, Excel, database, stdin, API, etc.)
- **Output format**: What should the result look like? (file type, console output, chart/visualisation, etc.)
- **Data specifics**: Column names, delimiters, encoding, expected row counts, missing-value conventions.
- **Error handling**: How should the script handle malformed input, missing files, or unexpected values?
- **Edge cases**: Large files, Unicode characters, empty datasets, date/time formats.
- **Dependencies**: Are there specific Python libraries the user prefers or already has installed?`;

    const mediumTopics = `Focus your questions on:
- **Core features**: What are the must-have features for the first working version?
- **User interface**: What should the UI look like? Any specific layout, navigation, or branding requirements?
- **Authentication**: Does the app need user login, roles, or access control?
- **Data storage**: Where should data live? (in-memory, local files, SQLite, PostgreSQL, etc.)
- **External integrations**: Does it need to call any APIs, send emails, or connect to other services?
- **Deployment target**: Will this run locally, on a server, in Docker, or as a static site?
- **Error handling**: How should the app handle failures, validation errors, and edge cases?
- **Dependencies & constraints**: Specific libraries, frameworks, or browser/runtime requirements.`;

    const tierLabel = tier === 'lite' ? 'a single Python script' : 'a multi-file application';
    const moduleContext = tier === 'lite'
      ? 'Module context: areaId="coding", moduleId="script-lite" (Tier 2 — single Python scripts).'
      : 'Module context: areaId="coding", moduleId="script-medium" (Tier 3 — multi-file applications).';

    const systemPrompt = `# Clarifying Questions Generator

You are a senior Python developer and software architect helping a user define requirements for ${tierLabel}.

${moduleContext}

## Your Task
Read the user's description (and optional data sample) and generate exactly 3-5 clarifying questions that will significantly improve the quality of the generated code.

## Question Guidelines
${tier === 'lite' ? liteTopics : mediumTopics}

## Rules
1. Ask ONLY questions whose answers will materially change the generated code.
2. Do NOT ask questions the description already answers.
3. If a data sample is provided, infer as much as you can from it and ask about ambiguities only.
4. Number each question (1., 2., 3., etc.).
5. Keep questions concise — one sentence each, optionally followed by example answers in parentheses.
6. Do NOT generate any code. Only output the numbered question list.

## Output Format
Return ONLY a numbered list of questions. No preamble, no summary, no code blocks.

Example:
1. What file encoding should the script expect? (UTF-8, Latin-1, etc.)
2. Should the output CSV include a header row?
3. How should the script handle rows with missing values — skip them, fill with defaults, or raise an error?`;

    const userParts: string[] = [];
    userParts.push(`## Description\n${description}`);
    if (dataSample) {
      userParts.push(`## Data Sample\n\`\`\`\n${dataSample}\n\`\`\``);
    }
    userParts.push('\nPlease generate 3-5 clarifying questions for this request.');

    return {
      systemPrompt,
      userMessage: userParts.join('\n\n'),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 2. buildScriptLitePrompt
  // ═══════════════════════════════════════════════════════════

  /**
   * Builds the generation prompt for Tier 2 (Script Lite) — a single,
   * complete Python script. Returns { systemPrompt, userMessage } for the
   * frontend to send through POST /api/claude/message.
   */
  function buildScriptLitePrompt(
    brief: string,
    constraints?: string,
  ): PromptPair {
    const constraintBlock = constraints
      ? `\n\n## CONSTRAINTS\nThe user has specified the following constraints. You MUST respect all of them:\n${constraints}`
      : '';

    const systemPrompt = `# Script Lite — Python Script Generator

Module context: areaId="coding", moduleId="script-lite" (Tier 2).

You are a senior Python developer. Your task is to generate a single, complete, production-ready Python script from the user's brief.

## Script Standards

- **Docstring**: Start with a triple-quoted docstring containing: purpose, usage example, input/output description, author note ("Generated by openEXPERT Script Lite").
- **Type hints**: Use type hints on all function signatures.
- **Error handling**: Wrap I/O and parsing operations in try/except. Print informative error messages to stderr. Exit with non-zero codes on fatal errors.
- **Logging**: Use Python's \`logging\` module (not bare \`print\`) for status messages. Set up a basic handler in \`__main__\`.
- **Main guard**: Include \`if __name__ == '__main__':\` block.
- **Pathlib**: Use \`pathlib.Path\` for all file paths.
- **Comments**: Add inline comments for non-obvious logic. Keep them concise.
- **Standard library first**: Prefer the standard library. Only use third-party packages when they provide clear value (e.g., pandas for tabular data, requests for HTTP).
- **Encoding**: Default to UTF-8 for all file I/O. Accept encoding as a parameter where relevant.
- **Progress**: For operations that may take >2 seconds, print progress indicators.
${constraintBlock}

## Output Format

Structure your ENTIRE response as follows:

1. A single Markdown code block tagged \`\`\`python containing the COMPLETE script. This must be a fully runnable .py file — no placeholders, no "TODO" comments, no truncation.

2. A \`## How to Run\` section with:
   - Command-line usage examples
   - Expected input/output
   - Common variations

3. A \`## Dependencies\` section listing any pip packages required. Format as:
   - \`pip install package1 package2\`
   - If no third-party packages are needed, state "No third-party dependencies — uses Python standard library only."

4. A \`## What It Does\` section: 2-4 sentences explaining the approach and any key design decisions.

5. A \`## Customisation Points\` section: bullet list of variables, thresholds, or sections the user might want to adjust.

Do NOT include any other commentary outside these sections.`;

    return {
      systemPrompt,
      userMessage: brief,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 3. buildScriptMediumPrompt
  // ═══════════════════════════════════════════════════════════

  /**
   * Builds the generation prompt for Tier 3 (Script Medium) — a complete
   * multi-file application. Returns { systemPrompt, userMessage } for the
   * frontend to send through POST /api/claude/message.
   */
  function buildScriptMediumPrompt(
    brief: string,
    appType: AppType,
    constraints?: string,
  ): PromptPair {
    const meta = APP_TYPE_META[appType] || APP_TYPE_META['html'];

    const constraintBlock = constraints
      ? `\n\n## CONSTRAINTS\nThe user has specified the following constraints. You MUST respect all of them:\n${constraints}`
      : '';

    // App-type-specific generation instructions
    const appTypeInstructions: Record<AppType, string> = {
      react: `### React SPA Requirements
- Use React 18+ with functional components and hooks.
- Use TypeScript (.tsx/.ts files).
- Style with Tailwind CSS utility classes. Include a tailwind.config.js.
- Use Vite as the build tool. Include a vite.config.ts.
- Structure components in a \`src/components/\` directory.
- Include a \`src/App.tsx\` as the entry component.
- Include \`index.html\` with the Vite root div.
- Keep state management simple (useState/useReducer). Only add Zustand or similar if explicitly requested.
- Include responsive design breakpoints (sm/md/lg).`,

      html: `### HTML/CSS/JS Requirements
- Use semantic HTML5 elements (header, main, nav, section, article, footer).
- Use modern CSS with CSS custom properties (variables), flexbox, and grid.
- Use vanilla ES6+ JavaScript — no build tools required.
- All files should work by opening index.html directly in a browser.
- Include a \`styles.css\` file (not inline styles).
- Include a \`script.js\` file (not inline scripts).
- Add basic responsive design with CSS media queries.
- Ensure accessibility: ARIA labels, keyboard navigation, sufficient contrast.`,

      'python-cli': `### Python CLI Requirements
- Use \`argparse\` for command-line interface (or \`click\` if complexity warrants it).
- Include clear \`--help\` text with usage examples.
- Structure as a proper Python package if >3 files, otherwise flat structure.
- Include a \`requirements.txt\` with pinned major versions.
- Include a \`main.py\` entry point with \`if __name__ == '__main__':\` guard.
- Use \`logging\` module for status output.
- Use \`pathlib.Path\` for all file operations.
- Use type hints throughout.
- Handle SIGINT gracefully for long-running operations.`,

      'node-api': `### Node.js API Requirements
- Use Express.js framework.
- Include proper error-handling middleware.
- Use a consistent route structure: \`routes/\` directory with modular route files.
- Include request validation (express-validator or joi).
- Include CORS configuration.
- Include a health-check endpoint (\`GET /health\`).
- Use environment variables for configuration (dotenv).
- Include a \`package.json\` with \`start\` and \`dev\` scripts.
- Add basic rate limiting for API endpoints.
- Use async/await (no raw callbacks).`,
    };

    const systemPrompt = `# Script Medium — Application Builder

Module context: areaId="coding", moduleId="script-medium" (Tier 3).

You are a senior full-stack developer. Your task is to generate a complete, working, multi-file application from the user's brief.

## Application Type: ${meta.label}
**Tech stack:** ${meta.stack}
**Entry file:** ${meta.entryFile}
**Dependency file:** ${meta.dependencyFile}
**Build:** ${meta.buildCommand}
**Run:** ${meta.runCommand}

${appTypeInstructions[appType] || ''}
${constraintBlock}

## General Standards (All App Types)

- **Complete files**: Every file must be complete and runnable. No placeholders, no "TODO" markers, no truncation.
- **Error handling**: Validate user input. Handle network/file errors gracefully. Show user-friendly error messages.
- **Code style**: Consistent indentation, clear naming, sensible file organisation.
- **README.md**: Include a README with: project description, prerequisites, setup instructions, how to run, project structure overview.
- **Dependencies**: Include the dependency manifest file (package.json / requirements.txt) with all required packages.
- **Comments**: Add brief comments for non-obvious logic. Do not over-comment obvious code.

## Output Format — CRITICAL

For EACH file in the application, output it as a Markdown code block with the relative file path as the language tag. Use this exact format:

\`\`\`path/to/filename.ext
file contents here
\`\`\`

Example:
\`\`\`src/App.tsx
import React from 'react';
// ...
\`\`\`

\`\`\`package.json
{
  "name": "my-app",
  "version": "1.0.0"
}
\`\`\`

### File Ordering
1. README.md (always first)
2. Dependency manifests (package.json, requirements.txt)
3. Configuration files (vite.config.ts, tailwind.config.js, tsconfig.json, .env.example)
4. Entry point files
5. Source files grouped by directory
6. Static assets / styles

After all files, include a brief \`## Architecture Notes\` section (3-5 sentences) explaining the key design decisions.

Do NOT include any other commentary outside the file blocks and the architecture notes.`;

    return {
      systemPrompt,
      userMessage: brief,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 4. buildPreviewModePrompt
  // ═══════════════════════════════════════════════════════════

  /**
   * Builds a prompt pair for Live Preview mode. Instead of generating a
   * multi-file application, Claude produces a SINGLE self-contained HTML file
   * that works directly in an iframe — no build step, no server needed.
   * This is used during the "describe" stage when preview_mode is toggled ON.
   */
  function buildPreviewModePrompt(
    brief: string,
    appType: AppType,
    constraints?: string,
  ): PromptPair {
    const meta = APP_TYPE_META[appType] || APP_TYPE_META['html'];

    const constraintBlock = constraints
      ? `\n\n## CONSTRAINTS\nThe user has specified the following constraints. You MUST respect all of them:\n${constraints}`
      : '';

    const systemPrompt = `# LIVE PREVIEW MODE — SINGLE HTML FILE ONLY

## CRITICAL INSTRUCTION — READ CAREFULLY
You MUST output exactly ONE file: a single, complete, self-contained HTML file.
Do NOT generate multiple files. Do NOT generate package.json, vite.config.js, src/ folders, or any multi-file project structure.
Everything — ALL HTML, ALL CSS, ALL JavaScript — goes into ONE \`\`\`html code block.

If you generate more than one file or more than one code block, you have FAILED the task.

## What You Are Building
A fully functional interactive prototype as a SINGLE .html file. The user's final target is ${meta.label} (${meta.stack}), but right now you are building an in-browser preview only.

## Technical Rules

1. **ONE file, ONE code block**: Output a single \`\`\`html code block containing the ENTIRE application.
2. **Zero build steps**: The file loads directly in an iframe or browser. No npm, no bundlers, no compilers, no server.
3. **CDN dependencies only** — load via <script> and <link> tags in <head>:
   - React: \`https://unpkg.com/react@18/umd/react.production.min.js\` + \`https://unpkg.com/react-dom@18/umd/react-dom.production.min.js\` + \`https://unpkg.com/@babel/standalone/babel.min.js\`
   - Tailwind CSS: \`https://cdn.tailwindcss.com\`
   - Other libraries: use unpkg.com or cdnjs.cloudflare.com (Chart.js, D3, date-fns, etc.)
4. **Use <script type="text/babel"> for JSX**: Babel standalone compiles JSX in the browser. Put ALL React components inside ONE <script type="text/babel"> tag.
5. **Inline CSS**: Use Tailwind utility classes. For custom CSS, use a single <style> tag in <head>.
6. **Inline sample data**: Hardcode realistic sample data as JavaScript arrays/objects. 10-20 items for tables/lists.
7. **Complete HTML5 document**: Start with \`<!DOCTYPE html>\`, include <html>, <head> (charset, viewport, title, CDN scripts), <body>, <div id="root">.
8. **Fully functional**: All described features must work — navigation, filtering, sorting, forms, state management, etc. This is NOT a mockup.
9. **Professional styling**: Proper spacing, colors, hover states, transitions, responsive design.
${constraintBlock}

## Output Format

Your ENTIRE response must be:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>...</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    // ALL React components and app logic here
  </script>
</body>
</html>
\`\`\`

## Preview Notes
- What this demonstrates
- Limitations vs production version

That's it. ONE html code block, then Preview Notes. Nothing else. No other code blocks. No other files.`;

    return {
      systemPrompt,
      userMessage: brief,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 5. buildConvertToProductionPrompt
  // ═══════════════════════════════════════════════════════════

  /**
   * Builds a prompt pair that takes a working preview HTML file and converts it
   * into a proper multi-file application in the target app_type's stack.
   * This is used when the user clicks "Convert to Production" after iterating
   * on the live preview.
   */
  function buildConvertToProductionPrompt(
    previewHtml: string,
    appType: AppType,
    constraints?: string,
  ): PromptPair {
    const meta = APP_TYPE_META[appType] || APP_TYPE_META['html'];

    const constraintBlock = constraints
      ? `\n\n## CONSTRAINTS\nThe user has specified the following constraints. You MUST respect all of them:\n${constraints}`
      : '';

    // Reuse the same app-type-specific instructions as buildScriptMediumPrompt
    const appTypeInstructions: Record<AppType, string> = {
      react: `### React SPA Requirements
- Use React 18+ with functional components and hooks.
- Use TypeScript (.tsx/.ts files).
- Style with Tailwind CSS utility classes. Include a tailwind.config.js.
- Use Vite as the build tool. Include a vite.config.ts.
- Structure components in a \`src/components/\` directory.
- Include a \`src/App.tsx\` as the entry component.
- Include \`index.html\` with the Vite root div.
- Keep state management simple (useState/useReducer). Only add Zustand or similar if explicitly requested.
- Include responsive design breakpoints (sm/md/lg).`,

      html: `### HTML/CSS/JS Requirements
- Use semantic HTML5 elements (header, main, nav, section, article, footer).
- Use modern CSS with CSS custom properties (variables), flexbox, and grid.
- Use vanilla ES6+ JavaScript — no build tools required.
- All files should work by opening index.html directly in a browser.
- Include a \`styles.css\` file (not inline styles).
- Include a \`script.js\` file (not inline scripts).
- Add basic responsive design with CSS media queries.
- Ensure accessibility: ARIA labels, keyboard navigation, sufficient contrast.`,

      'python-cli': `### Python CLI Requirements
- Use \`argparse\` for command-line interface (or \`click\` if complexity warrants it).
- Include clear \`--help\` text with usage examples.
- Structure as a proper Python package if >3 files, otherwise flat structure.
- Include a \`requirements.txt\` with pinned major versions.
- Include a \`main.py\` entry point with \`if __name__ == '__main__':\` guard.
- Use \`logging\` module for status output.
- Use \`pathlib.Path\` for all file operations.
- Use type hints throughout.
- Handle SIGINT gracefully for long-running operations.`,

      'node-api': `### Node.js API Requirements
- Use Express.js framework.
- Include proper error-handling middleware.
- Use a consistent route structure: \`routes/\` directory with modular route files.
- Include request validation (express-validator or joi).
- Include CORS configuration.
- Include a health-check endpoint (\`GET /health\`).
- Use environment variables for configuration (dotenv).
- Include a \`package.json\` with \`start\` and \`dev\` scripts.
- Add basic rate limiting for API endpoints.
- Use async/await (no raw callbacks).`,
    };

    const systemPrompt = `# Script Medium — Convert Preview to Production

Module context: areaId="coding", moduleId="script-medium" (Tier 3 — Production Conversion).

You are a senior full-stack developer. Your task is to take a **working single-file HTML preview** and rebuild it as a **proper multi-file production application**.

## Target Application Type: ${meta.label}
**Tech stack:** ${meta.stack}
**Entry file:** ${meta.entryFile}
**Dependency file:** ${meta.dependencyFile}
**Build:** ${meta.buildCommand}
**Run:** ${meta.runCommand}

${appTypeInstructions[appType] || ''}
${constraintBlock}

## Conversion Rules

1. **Preserve ALL functionality**: Every feature, interaction, UI element, and behaviour from the preview HTML MUST be present in the production version. Do not drop or simplify anything.
2. **Proper file structure**: Split the single HTML file into proper, well-organised files following ${meta.label} conventions.
3. **Improve code organisation**: Extract components, utilities, constants, and types into separate files. Follow single-responsibility principles.
4. **Add proper error handling**: Replace any loose error handling from the preview with robust try/catch, error boundaries (React), validation, and user-friendly error messages.
5. **Replace CDN links with proper dependencies**: Convert CDN script tags into package.json / requirements.txt dependencies with proper imports.
6. **Replace inline sample data**: Move hardcoded data into separate data files, mock API endpoints, or clearly marked fixture files that are easy to replace with real data sources.
7. **Production quality**: Add proper TypeScript types (if applicable), consistent code style, meaningful variable names, and brief comments for non-obvious logic.
8. **README.md**: Include a README with: project description, prerequisites, setup instructions, how to run, project structure overview.

## General Standards (All App Types)

- **Complete files**: Every file must be complete and runnable. No placeholders, no "TODO" markers, no truncation.
- **Code style**: Consistent indentation, clear naming, sensible file organisation.
- **Dependencies**: Include the dependency manifest file (package.json / requirements.txt) with all required packages.
- **Comments**: Add brief comments for non-obvious logic. Do not over-comment obvious code.

## Output Format — CRITICAL

For EACH file in the application, output it as a Markdown code block with the relative file path as the language tag. Use this exact format:

\`\`\`path/to/filename.ext
file contents here
\`\`\`

Example:
\`\`\`src/App.tsx
import React from 'react';
// ...
\`\`\`

\`\`\`package.json
{
  "name": "my-app",
  "version": "1.0.0"
}
\`\`\`

### File Ordering
1. README.md (always first)
2. Dependency manifests (package.json, requirements.txt)
3. Configuration files (vite.config.ts, tailwind.config.js, tsconfig.json, .env.example)
4. Entry point files
5. Source files grouped by directory
6. Static assets / styles

After all files, include a brief \`## Architecture Notes\` section (3-5 sentences) explaining the key design decisions and how the preview was restructured for production.

Do NOT include any other commentary outside the file blocks and the architecture notes.`;

    const userMessage = `## Convert This Preview to Production

Below is a working single-file HTML preview. Convert it into a proper ${meta.label} application with the full multi-file structure described in the system instructions.

Preserve ALL functionality — every feature, interaction, and UI element must work identically in the production version.

## Preview HTML

\`\`\`html
${previewHtml}
\`\`\``;

    return {
      systemPrompt,
      userMessage,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 6. buildIterationPrompt
  // ═══════════════════════════════════════════════════════════

  /**
   * Builds a prompt for iterating on a previously generated Tier 3 application.
   * Takes the previous Claude response (containing all generated files) and the
   * user's feedback, and produces a prompt that asks Claude to apply changes.
   *
   * Only changed files should be output — unchanged files should be omitted.
   */
  function buildIterationPrompt(
    previousOutput: string,
    feedback: string,
    appType: AppType,
  ): PromptPair {
    const meta = APP_TYPE_META[appType] || APP_TYPE_META['html'];

    const systemPrompt = `# Script Medium — Iteration Mode

Module context: areaId="coding", moduleId="script-medium" (Tier 3 — iteration).

You are a senior full-stack developer refining an existing application based on user feedback.

## Application Type: ${meta.label}
**Tech stack:** ${meta.stack}

## Iteration Rules

1. **Read the previous output carefully.** The user's full application is provided below their feedback.
2. **Only output files that have changed.** Do NOT re-output files that are identical to the previous version.
3. **If a file is deleted**, output it as an empty code block with a comment: \`// DELETED\` or \`# DELETED\`.
4. **If a new file is added**, output it in full.
5. **Preserve working functionality.** Do not break features that the user did not ask to change.
6. **Maintain code style consistency** with the existing codebase.

## Output Format

For each CHANGED or NEW file, output it as a Markdown code block with the file path as the language tag:

\`\`\`path/to/changed-file.ext
updated contents here
\`\`\`

After all changed files, include:
- \`## Changes Made\` — bullet list of what was changed and why.
- \`## Files Unchanged\` — list the files that were NOT modified (so the user knows which to keep as-is).

If the user's feedback requires updating dependencies, include the updated dependency manifest file.

Do NOT include any other commentary outside the file blocks and the change summary.`;

    const userMessage = `## User Feedback\n${feedback}\n\n## Previous Application Output\nBelow is the complete previous generation. Apply the feedback above and output only the changed files.\n\n---\n\n${previousOutput}`;

    return {
      systemPrompt,
      userMessage,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 7. parseScriptFromResponse
  // ═══════════════════════════════════════════════════════════

  /**
   * Extracts the Python script, explanation text, and dependency list from
   * Claude's Markdown response for a Script Lite (Tier 2) generation.
   *
   * Looks for:
   * - A ```python code block -> script
   * - "## What It Does" or "## How to Run" sections -> explanation
   * - "## Dependencies" section -> parsed into an array of package names
   */
  function parseScriptFromResponse(response: string): ParsedScript {
    // ── Extract the Python code block ──────────────────────
    let script = '';
    const pythonBlockRegex = /```python\s*\n([\s\S]*?)```/;
    const pythonMatch = response.match(pythonBlockRegex);
    if (pythonMatch) {
      script = pythonMatch[1].trim();
    } else {
      // Fallback: try any code block (the first one)
      const anyBlockRegex = /```[a-z]*\s*\n([\s\S]*?)```/;
      const anyMatch = response.match(anyBlockRegex);
      if (anyMatch) {
        script = anyMatch[1].trim();
      }
    }

    // ── Extract explanation sections ───────────────────────
    const explanationParts: string[] = [];

    const howToRunRegex = /## How to Run\s*\n([\s\S]*?)(?=\n## |\n```|$)/;
    const howToRunMatch = response.match(howToRunRegex);
    if (howToRunMatch) {
      explanationParts.push(`How to Run:\n${howToRunMatch[1].trim()}`);
    }

    const whatItDoesRegex = /## What It Does\s*\n([\s\S]*?)(?=\n## |\n```|$)/;
    const whatItDoesMatch = response.match(whatItDoesRegex);
    if (whatItDoesMatch) {
      explanationParts.push(`What It Does:\n${whatItDoesMatch[1].trim()}`);
    }

    const customisationRegex = /## Customis?ation Points?\s*\n([\s\S]*?)(?=\n## |\n```|$)/;
    const customisationMatch = response.match(customisationRegex);
    if (customisationMatch) {
      explanationParts.push(`Customisation Points:\n${customisationMatch[1].trim()}`);
    }

    const explanation = explanationParts.join('\n\n');

    // ── Extract dependencies ───────────────────────────────
    const dependencies: string[] = [];
    const depsRegex = /## Dependencies\s*\n([\s\S]*?)(?=\n## |\n```|$)/;
    const depsMatch = response.match(depsRegex);
    if (depsMatch) {
      const depsText = depsMatch[1].trim();

      // Check for "no dependencies" signals
      const noDepsRegex = /no\s+third[- ]party|standard\s+library\s+only|no\s+external|no\s+dependencies/i;
      if (!noDepsRegex.test(depsText)) {
        // Try to find a pip install line
        const pipRegex = /pip install\s+([\w\s\-\[\],>=<.!]+)/i;
        const pipMatch = depsText.match(pipRegex);
        if (pipMatch) {
          const packages = pipMatch[1]
            .split(/\s+/)
            .map(p => p.trim())
            .filter(p => p && !p.startsWith('-') && !p.startsWith('#'));
          dependencies.push(...packages);
        }

        // Also check for bullet-list format: - packagename or - `packagename`
        const bulletRegex = /^[-*]\s+`?([a-zA-Z0-9_-]+(?:\[[\w,]+\])?)`?/gm;
        let bulletMatch;
        while ((bulletMatch = bulletRegex.exec(depsText)) !== null) {
          const pkg = bulletMatch[1].trim();
          if (pkg && !dependencies.includes(pkg) && pkg.toLowerCase() !== 'no' && pkg.toLowerCase() !== 'none') {
            dependencies.push(pkg);
          }
        }
      }
    }

    return { script, explanation, dependencies };
  }

  // ═══════════════════════════════════════════════════════════
  // 8. parseFilesFromResponse
  // ═══════════════════════════════════════════════════════════

  /**
   * Extracts multiple files from Claude's Markdown response for a Script Medium
   * (Tier 3) generation. Looks for code blocks where the language tag is a
   * file path (contains a dot or slash).
   *
   * Patterns recognised:
   *   ```path/to/file.ext       (path as language tag)
   *   ```filename.ext           (file in root)
   *
   * Returns an array of { path, content, language }.
   */
  function parseFilesFromResponse(response: string): ParsedFile[] {
    const files: ParsedFile[] = [];

    // Match code blocks where the tag looks like a file path
    const codeBlockRegex = /```([\w.\/\\:@-]+(?:\.[\w]+)?)\s*\n([\s\S]*?)```/g;

    // Known pure-language tags that should NOT be treated as file paths
    const pureLanguageTags = new Set([
      'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'csharp',
      'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r',
      'sql', 'bash', 'sh', 'zsh', 'powershell', 'shell', 'cmd',
      'html', 'css', 'scss', 'less', 'sass', 'xml', 'yaml', 'yml',
      'json', 'toml', 'ini', 'markdown', 'md', 'text', 'txt',
      'diff', 'plaintext', 'console', 'log', 'output', 'env',
      'dockerfile', 'makefile', 'graphql', 'proto', 'lua', 'perl',
      'elixir', 'erlang', 'haskell', 'ocaml', 'clojure', 'dart',
    ]);

    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const tag = match[1].trim();
      const content = match[2];

      // Determine if this tag is a file path or a pure language identifier
      const isFilePath =
        tag.includes('/') ||
        tag.includes('\\') ||
        (tag.includes('.') && !pureLanguageTags.has(tag.toLowerCase()));

      if (isFilePath) {
        // Normalise path separators to forward slashes
        const filePath = tag.replace(/\\/g, '/');
        // Infer language from extension
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const language = inferLanguage(ext);

        files.push({
          path: filePath,
          content: content.trimEnd(),
          language,
        });
      }
    }

    return files;
  }

  /**
   * Maps file extension to a display language name.
   */
  function inferLanguage(ext: string): string {
    const extensionMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      mjs: 'javascript',
      cjs: 'javascript',
      py: 'python',
      rb: 'ruby',
      rs: 'rust',
      go: 'go',
      java: 'java',
      kt: 'kotlin',
      swift: 'swift',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      html: 'html',
      htm: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      toml: 'toml',
      xml: 'xml',
      md: 'markdown',
      sql: 'sql',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      bat: 'batch',
      ps1: 'powershell',
      txt: 'text',
      env: 'text',
      cfg: 'ini',
      ini: 'ini',
      conf: 'ini',
      svg: 'svg',
    };
    return extensionMap[ext] || ext || 'text';
  }

  // ═══════════════════════════════════════════════════════════
  // assembleBrief (unchanged)
  // ═══════════════════════════════════════════════════════════

  /**
   * Assemble a structured brief from user answers
   */
  function assembleBrief(
    description: string,
    answers: Record<string, string>,
    dataSample?: string,
  ): string {
    let brief = `## Task Description\n${description}\n\n`;

    if (dataSample) {
      brief += `## Sample Data\n\`\`\`\n${dataSample}\n\`\`\`\n\n`;
    }

    if (Object.keys(answers).length > 0) {
      brief += `## Clarifications\n`;
      for (const [question, answer] of Object.entries(answers)) {
        brief += `- **${question}**: ${answer}\n`;
      }
    }

    return brief;
  }

  // ═══════════════════════════════════════════════════════════
  // trackTokens (unchanged)
  // ═══════════════════════════════════════════════════════════

  /**
   * Track token consumption for a coding project
   */
  async function trackTokens(
    projectId: string,
    phase: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
  ) {
    try {
      const project = await db.get('SELECT cost_actual FROM coding_projects WHERE id = ?', projectId) as any;
      if (!project) return;

      const actual = JSON.parse(project.cost_actual || '{"total_input_tokens":0,"total_output_tokens":0,"total_cost_usd":0,"by_phase":{}}');
      actual.total_input_tokens += inputTokens;
      actual.total_output_tokens += outputTokens;
      actual.total_cost_usd += costUsd;

      if (!actual.by_phase[phase]) {
        actual.by_phase[phase] = { input: 0, output: 0, cost_usd: 0 };
      }
      actual.by_phase[phase].input += inputTokens;
      actual.by_phase[phase].output += outputTokens;
      actual.by_phase[phase].cost_usd += costUsd;

      await db.run("UPDATE coding_projects SET cost_actual = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify(actual), projectId);
    } catch (error) {
      console.error('[coding-engine] Token tracking error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════

  return {
    // Prompt builders (return { systemPrompt, userMessage } for the frontend)
    buildClarifyPrompt,
    buildScriptLitePrompt,
    buildScriptMediumPrompt,
    buildPreviewModePrompt,
    buildConvertToProductionPrompt,
    buildIterationPrompt,

    // Response parsers
    parseScriptFromResponse,
    parseFilesFromResponse,

    // Existing methods (unchanged)
    assembleBrief,
    trackTokens,

    // Expose metadata for routes/UI
    APP_TYPE_META,
  };
}
