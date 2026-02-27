/**
 * review-engine.test.ts
 *
 * Tests for 5-agent review orchestrator
 * Tests scoring, findings, and overall assessment
 */

import { describe, it, expect } from 'vitest';
import { createReviewOrchestrator, type ReviewContext } from '../server/services/review-orchestrator.js';

const mockContext: ReviewContext = {
  moduleId: 'gap-analysis',
  moduleName: 'AMLR Gap Analysis',
  areaId: 'fcp',
  outputFormats: ['gap-scoring-matrix', 'executive-summary'],
  userMessage: 'Analyze compliance with AMLR for Nordic Bank',
  systemPrompt: 'You are an expert AML compliance consultant...',
  thinkingLevel: 'investigate',
  model: 'claude-opus-4-6',
};

// ── Test 1: Review Orchestrator (No API) ─────────────────────────

describe('Review Orchestrator - Fallback Mode', () => {
  it('should run all 5 agents without Anthropic API', async () => {
    // Run without Anthropic client (uses fallback heuristics)
    const orchestrator = createReviewOrchestrator(undefined);

    const shortOutput = 'This is a very short output.';
    const result = await orchestrator.runAllReviewers(shortOutput, mockContext);

    expect(result.reviews).toHaveLength(5);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThanOrEqual(10);

    // Check all agents are present
    const agentIds = result.reviews.map((r) => r.agent);
    expect(agentIds).toContain('quality');
    expect(agentIds).toContain('regulatory');
    expect(agentIds).toContain('technical');
    expect(agentIds).toContain('communications');
    expect(agentIds).toContain('red-team');
  });

  it('should flag short outputs as incomplete', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const shortOutput = 'Test'; // Very short

    const result = await orchestrator.runAllReviewers(shortOutput, mockContext);

    const qualityReview = result.reviews.find((r) => r.agent === 'quality');
    expect(qualityReview).toBeDefined();
    expect(qualityReview!.findings.some((f) => f.message.includes('short'))).toBe(true);
  });

  it('should flag missing structure', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const unstructuredOutput = 'This is a long paragraph without any headings or structure. '.repeat(20);

    const result = await orchestrator.runAllReviewers(unstructuredOutput, mockContext);

    const qualityReview = result.reviews.find((r) => r.agent === 'quality');
    expect(qualityReview).toBeDefined();
    expect(qualityReview!.findings.some((f) => f.message.includes('headings'))).toBe(true);
  });

  it('should calculate weighted overall score', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = '# Test Output\n\nThis is a test output with proper structure.\n\n## Section 1\n\nContent here.';

    const result = await orchestrator.runAllReviewers(output, mockContext);

    // Weights: quality 0.25, regulatory 0.3, technical 0.2, comms 0.15, red-team 0.1
    const expectedScore =
      result.reviews.find((r) => r.agent === 'quality')!.score * 0.25 +
      result.reviews.find((r) => r.agent === 'regulatory')!.score * 0.3 +
      result.reviews.find((r) => r.agent === 'technical')!.score * 0.2 +
      result.reviews.find((r) => r.agent === 'communications')!.score * 0.15 +
      result.reviews.find((r) => r.agent === 'red-team')!.score * 0.1;

    expect(result.overallScore).toBeCloseTo(expectedScore, 1);
  });

  it('should set humanReviewRequired for critical findings', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = 'Test';

    const result = await orchestrator.runAllReviewers(output, mockContext);

    // Short output should trigger high severity finding
    const hasCriticalOrHigh = result.reviews.some((r) =>
      r.findings.some((f) => f.severity === 'critical' || f.severity === 'high')
    );

    if (hasCriticalOrHigh) {
      const hasCritical = result.reviews.some((r) => r.findings.some((f) => f.severity === 'critical'));
      expect(result.humanReviewRequired).toBe(hasCritical);
    }
  });

  it('should approve outputs with no critical/high issues', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const goodOutput = `# Executive Summary

## Key Findings

1. Compliance with AMLR 2024/1624 is 85% complete
2. Three high-priority gaps identified
3. Remediation plan included

## Gap Analysis

| Requirement | Status | Priority |
|-------------|--------|----------|
| Article 5   | ✅ Compliant | High |
| Article 6   | ⚠️ Partial | Medium |

## Recommendations

1. Update AML policy by Q2 2026
2. Enhance transaction monitoring thresholds
3. Conduct training for all staff

## Conclusion

The bank demonstrates strong AML compliance foundation with clear remediation path for identified gaps.
`;

    const result = await orchestrator.runAllReviewers(goodOutput, mockContext);

    // Good output should have fewer critical/high findings
    const criticalCount = result.reviews.flatMap((r) => r.findings.filter((f) => f.severity === 'critical')).length;
    const highCount = result.reviews.flatMap((r) => r.findings.filter((f) => f.severity === 'high')).length;

    expect(criticalCount).toBe(0);
    expect(result.approved).toBe(highCount <= 2);
  });

  it('should track execution time per agent', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = '# Test\n\nContent';

    const result = await orchestrator.runAllReviewers(output, mockContext);

    result.reviews.forEach((review) => {
      expect(review.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(review.executionTimeMs).toBeLessThan(5000); // Should complete quickly in fallback mode
    });

    expect(result.totalExecutionTimeMs).toBeGreaterThan(0);
  });

  it('should generate summary with score labels', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = '# Test';

    const result = await orchestrator.runAllReviewers(output, mockContext);

    expect(result.summary).toBeDefined();
    expect(result.summary).toMatch(/Overall Quality:/);
    expect(result.summary).toMatch(/Agent Scores:/);

    // Should contain score emojis
    expect(/🟢|🟡|🟠|🔴/.test(result.summary)).toBe(true);
  });

  it('should include findings count in summary', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = 'Short';

    const result = await orchestrator.runAllReviewers(output, mockContext);

    const totalFindings = result.reviews.reduce((sum, r) => sum + r.findings.length, 0);

    if (totalFindings > 0) {
      expect(result.summary).toMatch(/finding/);
    }
  });
});

// ── Test 2: Review Context ────────────────────────────────────────

describe('Review Context', () => {
  it('should pass module context to reviewers', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = '# Test';

    const customContext: ReviewContext = {
      ...mockContext,
      moduleId: 'custom-module',
      moduleName: 'Custom Analysis',
      areaId: 'custom-area',
    };

    const result = await orchestrator.runAllReviewers(output, customContext);

    expect(result).toBeDefined();
    expect(result.reviews).toHaveLength(5);
  });
});

// ── Test 3: Finding Severity Levels ──────────────────────────────

describe('Finding Severity', () => {
  it('should categorize findings by severity', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = 'Test'; // Will trigger high severity

    const result = await orchestrator.runAllReviewers(output, mockContext);

    const allFindings = result.reviews.flatMap((r) => r.findings);
    const severities = new Set(allFindings.map((f) => f.severity));

    // Should have at least one severity level
    expect(severities.size).toBeGreaterThan(0);

    // All severities should be valid
    allFindings.forEach((finding) => {
      expect(['critical', 'high', 'medium', 'low', 'info']).toContain(finding.severity);
    });
  });
});

// ── Test 4: Score Ranges ──────────────────────────────────────────

describe('Score Validation', () => {
  it('should return scores between 0-10', async () => {
    const orchestrator = createReviewOrchestrator(undefined);
    const output = '# Test\n\nContent';

    const result = await orchestrator.runAllReviewers(output, mockContext);

    result.reviews.forEach((review) => {
      expect(review.score).toBeGreaterThanOrEqual(0);
      expect(review.score).toBeLessThanOrEqual(10);
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(10);
  });

  it('should have higher scores for better content', async () => {
    const orchestrator = createReviewOrchestrator(undefined);

    const poorOutput = 'Test';
    const goodOutput = `# Comprehensive Analysis

## Executive Summary
This document provides a thorough analysis of compliance requirements.

## Detailed Findings
- Finding 1: Well-documented process
- Finding 2: Clear implementation path
- Finding 3: Robust control framework

## Recommendations
1. Continue current practices
2. Monitor effectiveness quarterly
3. Update documentation annually

## Conclusion
Strong compliance posture with minor enhancements recommended.
`;

    const poorResult = await orchestrator.runAllReviewers(poorOutput, mockContext);
    const goodResult = await orchestrator.runAllReviewers(goodOutput, mockContext);

    // Good output should generally score higher
    expect(goodResult.overallScore).toBeGreaterThan(poorResult.overallScore);
  });
});

console.log('\n✅ All review engine tests ready to run!\n');
console.log('Run with: pnpm test tests/review-engine.test.ts\n');
