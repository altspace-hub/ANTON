# Intelligent Testing with Claude Sonnet 4.6

## Overview

This testing system uses **Claude Sonnet 4.6** to intelligently test all features of openEXPERT. Unlike traditional automated tests that follow fixed scripts, Claude analyzes the application, suggests test scenarios, and validates results.

## Why Use Claude for Testing?

Claude Sonnet 4.6 excels at:
- **Systematic analysis** - Understands what needs to be tested
- **Creative test generation** - Suggests edge cases you might miss
- **Intelligent validation** - Determines if responses are correct
- **Natural language reporting** - Explains failures clearly
- **Adaptive testing** - Adjusts strategy based on results

## What Gets Tested

### 1. API Endpoint Testing
Claude analyzes all API endpoints and tests:
- ✅ Response structure validation
- ✅ Required field presence
- ✅ Data type correctness
- ✅ Array/object consistency
- ✅ Error handling

**Endpoints tested:**
- `/api/config` - System configuration
- `/api/areas` - Expert areas listing
- `/api/modules/:id` - Module details
- `/api/sessions` - User sessions
- `/api/workflows` - Workflow management
- `/api/skills` - Skills library
- `/api/connections` - Database/API connections
- `/api/knowledge-graph/*` - Knowledge graph

### 2. Module Execution Testing
Tests the core AI functionality:
- ✅ Module execution via `/api/claude/message-sync`
- ✅ Response quality and structure
- ✅ Thinking levels (quick, think, think_hard, investigate)
- ✅ Creativity settings (strict, balanced, creative)
- ✅ Multi-model support (Opus, Sonnet, Haiku)

**Claude validates:**
- Response length (not too short)
- Content structure (headings, paragraphs)
- Relevance to the question
- Professional tone

### 3. Database Integrity Testing
Verifies database health:
- ✅ All expected tables exist
- ✅ No orphaned records
- ✅ Referential integrity maintained
- ✅ No duplicate IDs
- ✅ Proper foreign key relationships

**Tables checked:**
- `sessions`, `custom_modules`, `skills`, `personas`
- `workflows`, `workflow_steps`, `workflow_executions`
- `connections`, `connection_audit_log`
- `knowledge_graph_entities`, `knowledge_graph_relationships`

### 4. Security Testing
Claude suggests and executes security tests:
- ✅ SQL injection attempts (should be blocked)
- ✅ XSS payload rejection
- ✅ Path traversal prevention
- ✅ Rate limiting enforcement
- ✅ Authentication bypass attempts

**Security scenarios:**
```sql
-- SQL injection attempts
'; DROP TABLE sessions; --
1' OR '1'='1
' UNION SELECT NULL--

-- XSS payloads
<script>alert("XSS")</script>
<img src=x onerror=alert("XSS")>

-- Path traversal
../../../etc/passwd
..\\..\\windows\\system32\\config\\sam
```

### 5. Workflow Testing
Tests automation workflows:
- ✅ Multi-step execution
- ✅ Data flow between steps (template variables)
- ✅ API call steps (sync and async)
- ✅ Database query steps
- ✅ Error handling and recovery

### 6. Knowledge Graph Testing
Validates knowledge graph functionality:
- ✅ Entity extraction and storage
- ✅ Relationship detection
- ✅ Graph query performance
- ✅ Entity merging logic

---

## Setup

### 1. Get Your Anthropic API Key

1. Go to https://console.anthropic.com/
2. Create an account or sign in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy your key (starts with `sk-ant-...`)

### 2. Set Environment Variable

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

**Windows (Command Prompt):**
```cmd
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Mac/Linux:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Permanent (add to `.env` file):**
```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" >> .env
```

### 3. Ensure Server is Running

The testing script needs the openEXPERT server running:

```bash
# Terminal 1: Start the server
pnpm dev

# Wait for:
# [server] openEXPERT by ANTON — server running on http://localhost:3001
# [server] [module-loader] Loaded 29 area(s), 240 module(s)
```

---

## Running Tests

### Full Test Suite

Run all test categories:

```bash
pnpm run test:intelligent
```

Or:

```bash
pnpm run test:claude
```

### Custom Test URL

Test a different server (e.g., production):

```bash
OPENEXPERT_URL=http://localhost:3001 pnpm run test:intelligent
```

---

## Understanding Results

### Test Output Format

```
🔍 Testing API Endpoints with Claude Sonnet 4.6

📋 Claude's testing guidance: For the /api/config endpoint, I suggest testing...

✅ [API Endpoints] GET /api/config
✅ [API Endpoints] GET /api/areas
❌ [API Endpoints] GET /api/sessions
   └─ Unexpected status: 500

✅ [Module Execution] Generic question test
✅ [Database Integrity] Table existence
⏭️  [Database Integrity] No orphaned workflow steps
   └─ Table may not exist yet
```

### Status Indicators

- ✅ **PASS** - Test passed successfully
- ❌ **FAIL** - Test failed (requires investigation)
- ⏭️  **SKIP** - Test skipped (expected on first run or not applicable)

### Final Summary

```
═══════════════════════════════════════════════════════════
📊 Test Summary
═══════════════════════════════════════════════════════════

Total Tests: 28
✅ Passed: 24 (85.7%)
❌ Failed: 2 (7.1%)
⏭️  Skipped: 2 (7.1%)
⏱️  Duration: 12.3s

❌ Failed Tests:

  [API Endpoints] GET /api/sessions
  └─ Unexpected status: 500

  [Security] Rate limiting active
  └─ No rate limiting detected
```

---

## Cost Estimation

Claude Sonnet 4.6 pricing (as of 2025):
- **Input:** ~$3 per million tokens
- **Output:** ~$15 per million tokens

**Typical test run:**
- Input tokens: ~5,000 (prompts + context)
- Output tokens: ~3,000 (analysis + suggestions)
- **Cost per run:** ~$0.06 USD

**100 test runs = ~$6 USD** (very affordable for comprehensive testing)

---

## Advanced Usage

### Test Specific Categories

Edit `scripts/intelligent-testing.ts` to run only specific tests:

```typescript
// Comment out categories you don't need
async function runAllTests() {
  await testAPIEndpoints();
  // await testModuleExecution(); // Skip this
  await testDatabaseIntegrity();
  // await testSecurity(); // Skip this
  await testWorkflows();
  await testKnowledgeGraph();
}
```

### Add Custom Tests

Add your own test category:

```typescript
async function testCustomFeature() {
  console.log('\n🔍 Testing Custom Feature\n');

  // Ask Claude for test suggestions
  const prompt = `Suggest tests for feature X that does Y...`;
  const guidance = await askClaude(prompt);

  // Execute tests
  try {
    const response = await fetch(`${API_URL}/api/custom-endpoint`);
    // ... validation logic
    logResult('Custom', 'Test name', 'pass', 'Details');
  } catch (error) {
    logResult('Custom', 'Test name', 'fail', String(error));
  }
}

// Add to runAllTests()
async function runAllTests() {
  // ... existing tests
  await testCustomFeature();
}
```

### Integration with CI/CD

Add to GitHub Actions:

```yaml
# .github/workflows/test.yml
name: Intelligent Testing

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm run db:init
      - name: Start server
        run: pnpm run start &
      - name: Wait for server
        run: sleep 10
      - name: Run intelligent tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: pnpm run test:intelligent
```

---

## Comparison: Traditional vs. Intelligent Testing

| Feature | Traditional Tests | Claude-Powered Tests |
|---------|------------------|---------------------|
| **Test generation** | Manual | AI-suggested |
| **Edge case coverage** | Limited by human imagination | Claude suggests creative scenarios |
| **Validation logic** | Fixed assertions | Intelligent analysis |
| **Failure explanations** | Generic error messages | Natural language explanations |
| **Adaptation** | Static scripts | Adapts to application changes |
| **Maintenance** | High (update tests manually) | Low (Claude adapts) |
| **Cost** | Developer time | ~$0.06 per run |

---

## Troubleshooting

### "ANTHROPIC_API_KEY is not set"

**Solution:** Set the environment variable before running tests:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
pnpm run test:intelligent
```

### "Failed to connect to http://localhost:3001"

**Solution:** Ensure the server is running:

```bash
# Terminal 1
pnpm dev

# Terminal 2 (after server starts)
pnpm run test:intelligent
```

### Tests timing out

**Solution:** Increase timeout or reduce test scope. Claude Sonnet 4.6 is fast, but large test suites may take time.

### High API costs

**Solution:** Use caching. Claude's prompt caching can reduce costs by ~90% for repeated tests.

---

## Best Practices

1. **Run tests before deployment** - Catch issues early
2. **Review Claude's suggestions** - Learn from AI's test ideas
3. **Keep tests automated** - Integrate into CI/CD pipeline
4. **Monitor costs** - Track API usage via Anthropic console
5. **Update regularly** - Re-run tests after code changes

---

## Future Enhancements

Planned features:
- [ ] Playwright integration for full UI testing
- [ ] Performance testing (load testing with Claude analyzing results)
- [ ] Regression testing (Claude compares new vs. old behavior)
- [ ] Test report generation (PDF/HTML reports)
- [ ] Slack/email notifications on failures

---

**Questions?** Check the script at `scripts/intelligent-testing.ts` or ask Claude for help! 🤖
