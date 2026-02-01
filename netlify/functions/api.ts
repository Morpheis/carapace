/**
 * Netlify Function entry point.
 * Single function handles all /api/v1/* routes via the router.
 */

import type { Context } from '@netlify/functions';
import { createRouter } from '../../src/api/router.js';
import { getProductionContainer } from '../../src/container.production.js';

const container = getProductionContainer();
const router = createRouter(container);

export default async (req: Request, _context: Context) => {
  return router.handle(req, { agent: null });
};

export const config = {
  path: '/api/v1/*',
};
