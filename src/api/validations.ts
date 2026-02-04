/**
 * Validation endpoints.
 * POST   /api/v1/contributions/:id/validate     — Validate a contribution (auth required)
 * GET    /api/v1/contributions/:id/validations   — Get validations for a contribution
 * DELETE /api/v1/contributions/:id/validate      — Remove own validation (auth required)
 */

import { pipeline, errorHandler } from '../middleware/index.js';
import { validateBody } from '../middleware/validate-body.js';
import type { Handler } from '../middleware/pipeline.js';
import type { Container } from '../container.js';
import type { BodySchema } from '../types/common.js';

const validateSchema: BodySchema = {
  signal: { type: 'string', required: true, maxLength: 50 },
  context: { type: 'string', required: false, maxLength: 2000 },
};

export function createValidationHandlers(container: Container) {
  const validate: Handler = pipeline(
    container.bodyLimit,
    container.logging,
    errorHandler,
    container.authenticate,
    container.rateLimit.validate,
    validateBody(validateSchema)
  )(async (req, ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    // Pattern: /api/v1/contributions/:id/validate
    const contributionId = parts[parts.length - 2];

    const body = await req.json() as Record<string, unknown>;

    const result = await container.validationService.validate(
      contributionId,
      {
        signal: body.signal as any,
        context: body.context as string | undefined,
      },
      ctx.agent!.id
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const getValidations: Handler = pipeline(
    container.logging,
    errorHandler
  )(async (req, _ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    // Pattern: /api/v1/contributions/:id/validations
    const contributionId = parts[parts.length - 2];

    const result = await container.validationService.getValidations(contributionId);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const removeValidation: Handler = pipeline(
    container.logging,
    errorHandler,
    container.authenticate
  )(async (req, ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    // Pattern: /api/v1/contributions/:id/validate
    const contributionId = parts[parts.length - 2];

    await container.validationService.removeValidation(contributionId, ctx.agent!.id);

    return new Response(null, { status: 204 });
  });

  return { validate, getValidations, removeValidation };
}
