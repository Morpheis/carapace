/**
 * Tests for ideonomic query expansion.
 * Verifies that queries are expanded through 4 reasoning lenses.
 */

import { describe, it, expect } from 'vitest';
import { expandQuery } from '../../src/ideonomy/expansions.js';

describe('expandQuery', () => {
  it('returns exactly 4 expanded queries', () => {
    const results = expandQuery('How should I handle agent memory?');
    expect(results).toHaveLength(4);
  });

  it('each expansion contains part of the original query', () => {
    const question = 'How should I handle agent memory?';
    const results = expandQuery(question);

    for (const expansion of results) {
      expect(expansion).toContain(question);
    }
  });

  it('truncates long queries to 200 characters in templates', () => {
    const longQuestion = 'A'.repeat(300);
    const results = expandQuery(longQuestion);

    for (const expansion of results) {
      // The original query should be truncated
      expect(expansion).not.toContain(longQuestion);
      expect(expansion).toContain('A'.repeat(200));
    }
  });

  it('each expansion is different', () => {
    const results = expandQuery('How should I handle agent memory?');
    const unique = new Set(results);
    expect(unique.size).toBe(4);
  });

  it('returns strings, not empty values', () => {
    const results = expandQuery('test query');
    for (const expansion of results) {
      expect(typeof expansion).toBe('string');
      expect(expansion.length).toBeGreaterThan(0);
    }
  });
});
