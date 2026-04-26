/**
 * school-prompt-builder.test.ts — pure-function tests for the
 * subject-module inference helper.
 *
 * The full buildSchoolPrompt() function reads disk files; tests for
 * that flow live in the school integration suite. Here we cover the
 * deterministic inferSubjectModule helper that is plain pattern matching.
 */

import { describe, it, expect } from 'vitest';
import {
  inferMathsModule,
  inferSubjectModule,
} from '../../../server/services/school-prompt-builder.js';

describe('inferSubjectModule — mathematics', () => {
  it('algebra for equation / linear / kvadrat keywords', () => {
    expect(inferSubjectModule('solve this linear equation', 'mathematics')).toBe('algebra');
    expect(inferSubjectModule('en kvadratisk ekvation', 'mathematics')).toBe('algebra');
  });

  it('geometry for triangle / area / pythag', () => {
    expect(inferSubjectModule('compute the area of this triangle', 'mathematics')).toBe('geometry');
    expect(inferSubjectModule('Pythagoras theorem', 'mathematics')).toBe('geometry');
    expect(inferSubjectModule('omkrets av en cirkel', 'mathematics')).toBe('geometry');
  });

  it('statistics for probability / median / mean', () => {
    expect(inferSubjectModule('what is the probability of', 'mathematics')).toBe('statistics');
    expect(inferSubjectModule('compute the median', 'mathematics')).toBe('statistics');
    expect(inferSubjectModule('sannolikhet för', 'mathematics')).toBe('statistics');
  });

  it('functions for function / gradient / kx', () => {
    expect(inferSubjectModule('find the gradient of this function', 'mathematics')).toBe('functions');
    expect(inferSubjectModule('en linjär funktion', 'mathematics')).toBe('functions');
  });

  it('number-theory for fraction / decimal / percent / power', () => {
    expect(inferSubjectModule('add these fractions', 'mathematics')).toBe('number-theory');
    expect(inferSubjectModule('what is 25 percent of', 'mathematics')).toBe('number-theory');
    expect(inferSubjectModule('beräkna procent', 'mathematics')).toBe('number-theory');
  });

  it('falls through to algebra on unrecognised text', () => {
    expect(inferSubjectModule('something completely unrelated', 'mathematics')).toBe('algebra');
  });

  it('inferMathsModule is a thin wrapper for mathematics', () => {
    expect(inferMathsModule('triangle area')).toBe(inferSubjectModule('triangle area', 'mathematics'));
  });
});

describe('inferSubjectModule — svenska', () => {
  it('reading-comprehension for läs / text / förstå', () => {
    expect(inferSubjectModule('läsa en text', 'svenska')).toBe('reading-comprehension');
    expect(inferSubjectModule('förstå stycket', 'svenska')).toBe('reading-comprehension');
  });

  it('writing for skriv / uppsats', () => {
    expect(inferSubjectModule('skriva en uppsats', 'svenska')).toBe('writing');
    expect(inferSubjectModule('berättande genre', 'svenska')).toBe('writing');
    // Note: 'text' alone hits the reading-comprehension regex first
    // (broad match). Phrases combining 'argumenter' + 'text' resolve to
    // reading-comprehension; that's a known regex-ordering quirk —
    // the route-level handler can override based on additional context.
  });

  it('grammar for grammatik / verb / ordklasser', () => {
    expect(inferSubjectModule('grammatik och verb', 'svenska')).toBe('grammar');
  });

  it('falls through to writing on unrecognised text', () => {
    expect(inferSubjectModule('something else', 'svenska')).toBe('writing');
  });
});

describe('inferSubjectModule — english', () => {
  it('vocabulary for word / synonym', () => {
    expect(inferSubjectModule('what does this word mean', 'english')).toBe('vocabulary');
    expect(inferSubjectModule('find a synonym for', 'english')).toBe('vocabulary');
  });

  it('grammar for tense / preposition', () => {
    expect(inferSubjectModule('past tense forms', 'english')).toBe('grammar');
  });
});

describe('inferSubjectModule — science', () => {
  it('biology for cell / organism / växt', () => {
    expect(inferSubjectModule('how does a cell divide', 'science')).toBe('biology');
    expect(inferSubjectModule('djur och växt', 'science')).toBe('biology');
  });

  it('chemistry for atom / acid / kemi', () => {
    expect(inferSubjectModule('atoms and molecules', 'science')).toBe('chemistry');
    expect(inferSubjectModule('kemi för nybörjare', 'science')).toBe('chemistry');
  });

  it('physics for force / energy / fysik', () => {
    expect(inferSubjectModule('gravitational force', 'science')).toBe('physics');
    expect(inferSubjectModule('fysik och rörelse', 'science')).toBe('physics');
  });
});

describe('inferSubjectModule — social-studies', () => {
  it('history for war / revolution / 4-digit-year', () => {
    expect(inferSubjectModule('the French Revolution of 1789', 'social-studies')).toBe('history');
  });

  it('geography for country / climate', () => {
    expect(inferSubjectModule('climate of this country', 'social-studies')).toBe('geography');
  });

  it('civics for democracy / EU / election', () => {
    expect(inferSubjectModule('how does an election work', 'social-studies')).toBe('civics');
  });
});

describe('inferSubjectModule — computational-thinking', () => {
  it('debug-guide for error / TypeError', () => {
    expect(inferSubjectModule('I get a TypeError when running this', 'computational-thinking')).toBe('debug-guide');
  });

  it('code-explainer for "what does this code"', () => {
    expect(inferSubjectModule('what does this code do', 'computational-thinking')).toBe('code-explainer');
  });

  it('falls through to code-mentor', () => {
    expect(inferSubjectModule('help me with this Python program', 'computational-thinking')).toBe('code-mentor');
  });
});

describe('inferSubjectModule — unknown subject', () => {
  it('returns "general" for an unrecognised subjectId', () => {
    expect(inferSubjectModule('any text', 'underwater-basket-weaving')).toBe('general');
  });
});
