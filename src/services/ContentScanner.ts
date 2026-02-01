/**
 * Content scanner for prompt injection and malicious content detection.
 *
 * Scans contribution text fields for known injection patterns, obfuscation
 * techniques, and suspicious content. Flags but does not reject — flagged
 * contributions are quarantined for review.
 *
 * This is defense-in-depth, not a silver bullet. Sophisticated attacks
 * will bypass pattern matching. The validation system (Phase 2) and
 * trust scoring provide additional layers.
 */

export interface ScanResult {
  flagged: boolean;
  reasons: string[];
}

interface ScanInput {
  claim?: string;
  reasoning?: string;
  applicability?: string;
  limitations?: string;
}

// Fields where URLs are suspicious (claims/reasoning shouldn't contain URLs)
const URL_SENSITIVE_FIELDS: Array<keyof ScanInput> = ['claim', 'reasoning'];

// Fields to scan for injection patterns (all text fields)
const ALL_SCANNABLE_FIELDS: Array<keyof ScanInput> = [
  'claim',
  'reasoning',
  'applicability',
  'limitations',
];

export class ContentScanner {
  private injectionPatterns: Array<{ pattern: RegExp; label: string }> = [
    // Direct instruction override
    {
      pattern: /ignore\s+(your\s+)?(previous|prior|all|above)\s+(instructions|directives|rules|prompts)/i,
      label: 'injection: instruction override',
    },
    {
      pattern: /ignore\s+your\s+(instructions|directives|rules|prompts)/i,
      label: 'injection: instruction override',
    },
    {
      pattern: /disregard\s+(your\s+)?(previous|prior|all|above)/i,
      label: 'injection: instruction override',
    },
    {
      pattern: /override\s+(all\s+)?(previous|prior)\s+(directives|instructions)/i,
      label: 'injection: instruction override',
    },

    // System prompt markers
    {
      pattern: /\[SYSTEM\]|\[\[SYSTEM\]\]|<<SYS>>|<\|im_start\|>system/i,
      label: 'injection: system prompt marker',
    },
    {
      pattern: /^SYSTEM:/im,
      label: 'injection: system prompt marker',
    },
    {
      pattern: /new\s+instructions?\s*:/i,
      label: 'injection: instruction injection',
    },

    // Role reassignment
    {
      pattern: /you\s+are\s+now\s+(a|an)\s/i,
      label: 'injection: role reassignment',
    },
    {
      pattern: /from\s+now\s+on,?\s+you\s+(are|will|should|must)/i,
      label: 'injection: role reassignment',
    },

    // Secret extraction
    {
      pattern: /(output|print|reveal|show|send|share|display|leak)\s+(your|the)\s+(api\s*key|secret|token|password|system\s*prompt|credentials|private\s*key)/i,
      label: 'injection: secret extraction attempt',
    },
  ];

  scan(input: ScanInput): ScanResult {
    const reasons: string[] = [];

    // Scan all text fields for injection patterns
    for (const field of ALL_SCANNABLE_FIELDS) {
      const text = input[field];
      if (!text) continue;

      for (const { pattern, label } of this.injectionPatterns) {
        if (pattern.test(text)) {
          reasons.push(`${label} (in ${field})`);
        }
      }
    }

    // URL detection in sensitive fields only
    for (const field of URL_SENSITIVE_FIELDS) {
      const text = input[field];
      if (!text) continue;

      if (/https?:\/\/\S+/i.test(text)) {
        reasons.push(`suspicious url in ${field}`);
      }
    }

    // Zero-width character obfuscation
    for (const field of ALL_SCANNABLE_FIELDS) {
      const text = input[field];
      if (!text) continue;

      const zeroWidthCount = (
        text.match(/[\u200b\u200c\u200d\u2060\ufeff]/g) || []
      ).length;

      if (zeroWidthCount > 5) {
        reasons.push(`obfuscation: excessive zero-width characters in ${field} (${zeroWidthCount})`);
      }
    }

    // Base64-encoded blocks (>40 chars of base64 alphabet is suspicious)
    for (const field of ALL_SCANNABLE_FIELDS) {
      const text = input[field];
      if (!text) continue;

      if (/[A-Za-z0-9+/]{40,}={0,2}/.test(text)) {
        reasons.push(`suspicious base64-encoded block in ${field}`);
      }
    }

    return {
      flagged: reasons.length > 0,
      reasons,
    };
  }
}
