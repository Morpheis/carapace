/**
 * Body validation middleware.
 * Parses JSON body and validates against a schema.
 * Returns 400 with field-level errors if validation fails.
 */

import type { BodySchema, FieldSchema } from '../types/common.js';
import type { Handler, Middleware } from './pipeline.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function validateBody(schema: BodySchema): Middleware {
  return (next: Handler): Handler => {
    return async (req, ctx) => {
      let body: Record<string, unknown>;

      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return errorResponse('Request body must be valid JSON');
      }

      const errors = validateFields(body, schema);

      if (errors.length > 0) {
        return errorResponse(errors.join('; '), { fields: errors });
      }

      // Re-create request with parsed body so handler can read it again
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      });

      return next(newReq, ctx);
    };
  };
}

function validateFields(
  body: Record<string, unknown>,
  schema: BodySchema
): string[] {
  const errors: string[] = [];

  for (const [field, fieldSchema] of Object.entries(schema)) {
    const value = body[field];

    // Required check
    if (fieldSchema.required && (value === undefined || value === null)) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip optional missing fields
    if (value === undefined || value === null) {
      continue;
    }

    // Type check
    const typeError = checkType(field, value, fieldSchema);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    // Constraints
    const constraintErrors = checkConstraints(field, value, fieldSchema);
    errors.push(...constraintErrors);
  }

  return errors;
}

function checkType(
  field: string,
  value: unknown,
  schema: FieldSchema
): string | null {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return `${field} must be a string`;
      break;
    case 'number':
      if (typeof value !== 'number') return `${field} must be a number`;
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return `${field} must be a boolean`;
      break;
    case 'array':
      if (!Array.isArray(value)) return `${field} must be an array`;
      break;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value))
        return `${field} must be an object`;
      break;
  }
  return null;
}

function checkConstraints(
  field: string,
  value: unknown,
  schema: FieldSchema
): string[] {
  const errors: string[] = [];

  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(
        `${field} must be ${schema.maxLength} characters or less`
      );
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(
        `${field} must be one of: ${schema.enum.join(', ')}`
      );
    }
  }

  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`${field} must be at least ${schema.min}`);
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(`${field} must be at most ${schema.max}`);
    }
  }

  return errors;
}

function errorResponse(
  message: string,
  details?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'INVALID_REQUEST',
        message,
        ...(details && { details }),
      },
    }),
    { status: 400, headers: JSON_HEADERS }
  );
}
