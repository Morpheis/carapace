/**
 * Ideonomic query expansion.
 * Expands a query through 4 reasoning lenses (divisions) to find
 * insights the agent wouldn't have thought to ask for.
 *
 * Based on ideonomic principles — the idea that ideas have discoverable
 * laws and can be systematically combined to generate novel insights.
 */

export interface ExpansionLens {
  division: string;
  template: string;
}

const MAX_QUERY_LENGTH = 200;

export const EXPANSION_LENSES: ExpansionLens[] = [
  {
    division: 'ANALOGIES',
    template: 'What natural or engineered systems are analogous to: {query}',
  },
  {
    division: 'OPPOSITES',
    template:
      'What are the failure modes, anti-patterns, or opposites of: {query}',
  },
  {
    division: 'CAUSES',
    template:
      'What are the root causes and driving forces behind: {query}',
  },
  {
    division: 'COMBINATIONS',
    template:
      'What unexpected combinations or hybrid approaches relate to: {query}',
  },
];

/**
 * Expand a query through ideonomic reasoning divisions.
 * Returns 4 expanded query strings, one per lens.
 */
export function expandQuery(question: string): string[] {
  const truncated =
    question.length > MAX_QUERY_LENGTH
      ? question.slice(0, MAX_QUERY_LENGTH)
      : question;

  return EXPANSION_LENSES.map((lens) =>
    lens.template.replace('{query}', truncated)
  );
}
