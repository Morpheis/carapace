/**
 * Voyage AI embedding provider.
 * Uses the Voyage API (OpenAI-compatible format) for voyage-4-lite (1024 dimensions).
 * No SDK dependency — uses native fetch.
 */

import type { IEmbeddingProvider } from './IEmbeddingProvider.js';

const API_URL = 'https://api.voyageai.com/v1/embeddings';
const DEFAULT_MODEL = 'voyage-4-lite';
const DEFAULT_DIMENSIONS = 1024;

interface VoyageEmbeddingData {
  object: string;
  embedding: number[];
  index: number;
}

interface VoyageEmbeddingResponse {
  object: string;
  data: VoyageEmbeddingData[];
  model: string;
  usage: { total_tokens: number };
}

export class VoyageEmbeddingProvider implements IEmbeddingProvider {
  private apiKey: string;
  private model: string;
  readonly dimensions: number;

  constructor(opts?: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
  }) {
    this.apiKey = opts?.apiKey ?? process.env.VOYAGE_API_KEY ?? '';
    this.model = opts?.model ?? DEFAULT_MODEL;
    this.dimensions = opts?.dimensions ?? DEFAULT_DIMENSIONS;
  }

  async generate(text: string): Promise<number[]> {
    const response = await this.callApi([text], 'document');
    return response.data[0].embedding;
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.callApi(texts, 'document');

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  private async callApi(
    input: string[],
    inputType: 'query' | 'document'
  ): Promise<VoyageEmbeddingResponse> {
    const body: Record<string, unknown> = {
      input,
      model: this.model,
      input_type: inputType,
    };

    // Only include output_dimension for non-default values
    if (this.dimensions !== DEFAULT_DIMENSIONS) {
      body.output_dimension = this.dimensions;
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = (err as Record<string, unknown>).detail ?? 'Unknown error';
      throw new Error(`Voyage API error (${res.status}): ${detail}`);
    }

    return (await res.json()) as VoyageEmbeddingResponse;
  }
}
