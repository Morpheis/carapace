/**
 * OpenAI embedding provider.
 * Wraps the OpenAI API for text-embedding-3-small (1536 dimensions).
 */

import OpenAI from 'openai';
import type { IEmbeddingProvider } from './IEmbeddingProvider.js';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private client: OpenAI;
  private model: string;
  readonly dimensions: number;

  constructor(opts?: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
  }) {
    this.client = new OpenAI({
      apiKey: opts?.apiKey ?? process.env.OPENAI_API_KEY,
    });
    this.model = opts?.model ?? DEFAULT_MODEL;
    this.dimensions = opts?.dimensions ?? DEFAULT_DIMENSIONS;
  }

  async generate(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
    });

    return response.data[0].embedding;
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });

    // OpenAI returns embeddings in the same order as input
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
