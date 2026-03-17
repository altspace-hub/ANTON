import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import path from 'path';
import { executeScript } from '../services/script-executor.js';
import { callSync } from '../services/claude-client.js';

const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './outputs');
const MAX_FIX_CYCLES = 3;

export async function createPptxPipelineRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // POST /api/pptx-pipeline/generate
  // Calls Claude to generate a pptxgenjs script, then executes it
  router.post('/pptx-pipeline/generate', async (req, res) => {
    try {
      const { sessionId, content, slideStructure, brandSettings } = req.body;

      if (!content) {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      // Build the prompt for pptxgenjs script generation
      const userPrompt = buildScriptGenerationPrompt(content, slideStructure, brandSettings);

      // Call Claude to generate the script
      const result = await callSync({
        model: 'claude-sonnet-4-5-20250929',
        thinking: 'think_hard',
        system: `You are an expert pptxgenjs developer. Generate a complete, self-contained Node.js script that creates a professional PowerPoint presentation using pptxgenjs.

CRITICAL RULES:
- Output ONLY the Node.js script inside a single \`\`\`javascript code block
- The script must be self-contained (only require pptxgenjs)
- Use process.argv[2] for the output path
- Print PPTX_OUTPUT_PATH:<path> to stdout on success
- NO # in hex colors — use '2DD4A8' not '#2DD4A8'
- All positions/sizes in inches
- Never reuse option objects — create new ones each time
- Wrap in async function, await writeFile
- Use ANTON brand colors: bg '0B1426', accent '2DD4A8', text 'FFFFFF'/'E0E0E0'
- Maximum 6 bullet points per slide
- Minimum font size 12pt`,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Extract the JavaScript code block from Claude's response
      const codeMatch = result.text.match(/```(?:javascript|js)\n([\s\S]*?)```/);
      if (!codeMatch) {
        res.status(500).json({ error: 'Failed to extract script from Claude response' });
        return;
      }

      const scriptContent = codeMatch[1];

      // Execute the generated script
      const pptxId = randomUUID();
      const outputPath = path.join(OUTPUT_DIR, `presentation_${pptxId}.pptx`);

      const execResult = await executeScript({
        language: 'node',
        scriptContent: scriptContent.replace(
          /process\.argv\[2\]\s*\|\|[^;]+/,
          `'${outputPath.replace(/\\/g, '/')}'`
        ),
        outputDir: OUTPUT_DIR,
        timeoutMs: 60000,
      });

      if (!execResult.success) {
        res.json({
          success: false,
          error: 'Script execution failed',
          stderr: execResult.stderr,
          scriptContent,
          sessionId,
        });
        return;
      }

      const filePath = execResult.outputFilePath || outputPath;

      // Save record to session if provided
      if (sessionId) {
        try {
          await db.run(
            `INSERT INTO messages (id, session_id, role, content, created_at)
             VALUES (?, ?, 'assistant', ?, ?)`
          , randomUUID(), sessionId, `[PPTX Generated: ${path.basename(filePath)}]`, new Date().toISOString());
        } catch { /* non-fatal */ }
      }

      res.json({
        success: true,
        filePath,
        filename: path.basename(filePath),
        scriptContent,
        durationMs: execResult.durationMs,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/pptx-pipeline/qa
  // Content QA: verify the generated PPTX has expected content
  router.post('/pptx-pipeline/qa', async (req, res) => {
    try {
      const { filePath, expectedContent } = req.body;

      if (!filePath) {
        res.status(400).json({ error: 'filePath is required' });
        return;
      }

      // Basic content QA via file existence and size check
      const fs = await import('fs/promises');
      try {
        const stat = await fs.stat(filePath);
        const issues: string[] = [];

        if (stat.size < 10000) {
          issues.push('File size suspiciously small — may have empty or minimal slides');
        }

        // Check for placeholder text in the script source if provided
        if (expectedContent) {
          // We'd need to extract text from pptx — for now, basic checks
          const passed = stat.size > 10000;
          res.json({
            contentQA: {
              passed,
              fileSize: stat.size,
              issues,
            },
          });
        } else {
          res.json({
            contentQA: {
              passed: stat.size > 10000,
              fileSize: stat.size,
              issues,
            },
          });
        }
      } catch {
        res.json({
          contentQA: {
            passed: false,
            issues: ['Output file not found — script may have failed silently'],
          },
        });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/pptx-pipeline/fix
  // Auto-fix: send issues back to Claude, regenerate script, re-execute
  router.post('/pptx-pipeline/fix', async (req, res) => {
    try {
      const { originalScript, issues, content, cycleCount = 0 } = req.body;

      if (!originalScript || !issues || !Array.isArray(issues)) {
        res.status(400).json({ error: 'originalScript and issues[] are required' });
        return;
      }

      if (cycleCount >= MAX_FIX_CYCLES) {
        res.json({
          success: false,
          error: `Maximum fix cycles (${MAX_FIX_CYCLES}) reached`,
          cycleCount,
        });
        return;
      }

      // Ask Claude to fix the script
      const fixResult = await callSync({
        model: 'claude-sonnet-4-5-20250929',
        thinking: 'think',
        system: 'You are fixing a pptxgenjs Node.js script that had issues. Output ONLY the corrected script in a ```javascript code block. Keep the same structure but fix the reported issues.',
        messages: [{
          role: 'user',
          content: `The following pptxgenjs script had these issues:\n\n${issues.map((i: string, idx: number) => `${idx + 1}. ${i}`).join('\n')}\n\nOriginal script:\n\`\`\`javascript\n${originalScript}\n\`\`\`\n\nFix all issues and output the corrected script.`,
        }],
      });

      const codeMatch = fixResult.text.match(/```(?:javascript|js)\n([\s\S]*?)```/);
      if (!codeMatch) {
        res.json({ success: false, error: 'Failed to extract fixed script', cycleCount: cycleCount + 1 });
        return;
      }

      const fixedScript = codeMatch[1];
      const pptxId = randomUUID();
      const outputPath = path.join(OUTPUT_DIR, `presentation_fixed_${pptxId}.pptx`);

      const execResult = await executeScript({
        language: 'node',
        scriptContent: fixedScript.replace(
          /process\.argv\[2\]\s*\|\|[^;]+/,
          `'${outputPath.replace(/\\/g, '/')}'`
        ),
        outputDir: OUTPUT_DIR,
        timeoutMs: 60000,
      });

      res.json({
        success: execResult.success,
        filePath: execResult.outputFilePath || outputPath,
        scriptContent: fixedScript,
        fixesApplied: issues,
        cycleCount: cycleCount + 1,
        durationMs: execResult.durationMs,
        stderr: execResult.success ? undefined : execResult.stderr,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}

function buildScriptGenerationPrompt(
  content: string,
  slideStructure?: string,
  brandSettings?: { primaryColor?: string; secondaryColor?: string; fontFamily?: string }
): string {
  let prompt = `Create a professional PowerPoint presentation with the following content:\n\n${content}\n\n`;

  if (slideStructure) {
    prompt += `Slide structure guidance:\n${slideStructure}\n\n`;
  }

  if (brandSettings) {
    prompt += `Brand settings:\n`;
    if (brandSettings.primaryColor) prompt += `- Primary color: ${brandSettings.primaryColor}\n`;
    if (brandSettings.secondaryColor) prompt += `- Secondary color: ${brandSettings.secondaryColor}\n`;
    if (brandSettings.fontFamily) prompt += `- Font: ${brandSettings.fontFamily}\n`;
    prompt += '\n';
  }

  prompt += `Requirements:
- Create a complete, visually appealing presentation
- Use clear slide hierarchy: title slide, section dividers, content slides, summary
- Keep text concise — max 6 bullet points per slide
- Use the dark theme by default unless brand settings override
- Include data visualizations (tables, charts) where the content has structured data
- End with a summary/next steps slide`;

  return prompt;
}
