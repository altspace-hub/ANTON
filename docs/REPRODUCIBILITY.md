# Reproducible Outputs with Seed Parameter

## Overview
GPT and Mistral models support a `seed` parameter for deterministic outputs. When the same seed is used with identical prompt and settings, the model returns the same output.

## Supported Models
- ✅ GPT-4o (OpenAI)
- ✅ GPT-4o Mini (OpenAI)
- ✅ Mistral Large
- ❌ Claude Opus 4.6 (does not support seed — even temp=0 is not fully deterministic)
- ❌ Claude Sonnet 4.5 (does not support seed)
- ❌ Claude Haiku 4.5 (does not support seed)
- ❌ Gemini 2.0 Flash (does not support seed)

## Use Cases

### 1. Audit Trail
Regulatory compliance requires reproducible analysis. Set a seed when generating compliance reports so auditors can verify the exact output.

**Example:**
```
Seed: 123456
Module: Gap Analysis
Prompt: "Analyze our AML policy against AMLR requirements"
→ Exact same output every time with the same seed + prompt + settings
```

### 2. A/B Testing
Test prompt variations while controlling for randomness:
- Version A: New prompt + seed 12345
- Version B: Old prompt + seed 12345
- Compare outputs knowing randomness is controlled

### 3. Quality Assurance
Verify that system changes don't alter output by re-running with same seed.

**Example:**
```
Run 1: Seed 999000, GPT-4o, "Evaluate sanctions policy"
Run 2: (after system update) Same seed + prompt
→ Compare outputs to verify system integrity
```

## How to Use

1. **Select a GPT or Mistral model**
   Only OpenAI GPT and Mistral models support seeds. Claude and Gemini do not.

2. **Expand "Reproducibility Seed" in Advanced Settings**
   Click the "Advanced Settings" accordion, then expand "Reproducibility Seed".

3. **Enter a seed (0-999999) or generate a random seed**
   - Type a number manually, OR
   - Click "Generate" to create a random seed

4. **Run your analysis**
   The seed is included in the API call and stored in the audit log.

5. **Record the seed for future reproduction**
   The seed is saved in the audit log entry. To reproduce the output:
   - Use the same model
   - Use the same seed
   - Use the same prompt (system + user message)
   - Use the same settings (temperature/precision)

## Limitations
Seed does NOT guarantee reproducibility if:
- **Model version changes** — OpenAI/Mistral may update model weights
- **System prompt changes** — Any change to system prompt invalidates reproducibility
- **Temperature or other settings change** — Precision level must be identical
- **Conversation history changes** — Multi-turn conversations must have identical history
- **Only guarantees reproducibility for single-turn generation** — Multi-turn chats add complexity

## Best Practices

### 1. Use seeds for critical regulatory outputs
```
✅ Board reports, compliance assessments, regulatory submissions
❌ Exploratory analysis, brainstorming sessions
```

### 2. Record seed in session notes or external documentation
The audit log stores the seed automatically, but for high-stakes outputs:
- Copy seed to session notes
- Include seed in exported document footer
- Record in external compliance tracking system

### 3. Include seed in audit log entry
The system automatically stores seed in the audit log. To retrieve:
```sql
SELECT seed, model, created_at, session_id
FROM audit_log
WHERE session_id = 'your-session-id';
```

### 4. Test reproducibility before trusting for compliance
Before using seeds for regulatory work:
1. Run analysis with seed 123456
2. Run again with same seed + prompt + settings
3. Verify outputs are identical
4. If outputs differ, investigate model version changes

## Technical Implementation

### API Parameters
- **OpenAI:** `seed` parameter (integer, 0-999999)
- **Mistral:** `random_seed` parameter (integer, 0-999999)

### Database Schema
```sql
ALTER TABLE audit_log ADD COLUMN seed INTEGER;
```

### Request Example
```typescript
const response = await fetch('/api/claude/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o',
    userMessage: 'Analyze our AML policy',
    seed: 123456,
    // ... other parameters
  }),
});
```

## Reproducibility Verification Process

For critical compliance outputs:

1. **Initial Run**
   - Set seed: 555000
   - Document all settings (model, precision, system prompt)
   - Save output

2. **Verification Run (Same Day)**
   - Use same seed + settings
   - Compare outputs
   - Should be 100% identical

3. **Long-term Verification (Weeks/Months Later)**
   - Re-run with same seed + settings
   - If outputs differ → model version changed
   - Document discrepancies in audit trail

## Troubleshooting

### Outputs are different despite using same seed
**Possible causes:**
1. Model version updated by provider (OpenAI/Mistral)
2. System prompt changed
3. Precision/temperature setting changed
4. Conversation history differs (multi-turn chat)
5. Different model selected (e.g., GPT-4o vs GPT-4o Mini)

**Solution:**
- Verify all settings are identical
- Check audit log for seed value
- Contact provider if model version suspected

### Seed control doesn't appear
**Cause:** Selected model doesn't support seeds.
**Solution:** Switch to GPT-4o, GPT-4o Mini, or Mistral Large.

### Seed stored in audit log but output differs
**Cause:** Model version changed or settings differ.
**Solution:**
- Check audit log for all parameters (model, precision, thinking)
- Document that reproducibility failed due to model update
- Consider freezing model version (if provider supports)

## Regulatory Context

For FCP compliance work, reproducibility is valuable for:
- **Regulatory submissions** — Auditors can verify your analysis
- **Internal reviews** — Second-line can reproduce findings
- **Cross-jurisdictional consistency** — Same seed = same output across regions
- **Model validation** — Prove AI output is deterministic for governance

## Example: Board Report Reproducibility

```markdown
# AML Policy Gap Analysis — Board Report
Generated: 2026-02-19 14:30 UTC
Model: GPT-4o
Seed: 987654
Precision: Balanced
System Prompt Version: 2.3

This output is reproducible. To verify:
1. Use GPT-4o with seed 987654
2. Apply system prompt v2.3 (see audit log entry abc-123)
3. Use precision "Balanced"
4. Input: "Analyze our AML policy against AMLR 2024/1624"

Output hash (SHA-256): a3f4b2c1d5e6...
```

## Further Reading
- OpenAI Seed Documentation: https://platform.openai.com/docs/guides/reproducibility
- Mistral Random Seed: https://docs.mistral.ai/api#seed
- Anthropic (no seed support): https://docs.anthropic.com/claude/reference

---

**Questions?** See [Master Plan 1.14 — Seed Parameter Support](../MASTER_PLAN.md#114-seed-parameter-support)
