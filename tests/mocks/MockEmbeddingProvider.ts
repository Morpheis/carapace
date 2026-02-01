/**
 * Mock embedding provider for testing.
 * Generates deterministic pseudo-embeddings from text content.
 * Same text always produces the same embedding; different text produces different embeddings.
 */

import type { IEmbeddingProvider } from '../../src/providers/IEmbeddingProvider.js';

export class MockEmbeddingProvider implements IEmbeddingProvider {
  readonly dimensions = 64; // enough dimensions for meaningful separation in tests
  public callCount = 0;

  async generate(text: string): Promise<number[]> {
    this.callCount++;
    return this.textToVector(text);
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    this.callCount++;
    return texts.map((t) => this.textToVector(t));
  }

  // ── Test Helpers ──

  resetCallCount(): void {
    this.callCount = 0;
  }

  /**
   * Generate a deterministic vector from text.
   * Uses a simple hash-based approach — NOT real embeddings,
   * but guarantees: same text → same vector, different text → different vector.
   */
  private textToVector(text: string): number[] {
    const vector: number[] = [];
    for (let i = 0; i < this.dimensions; i++) {
      let hash = 0;
      const salted = `${text}:dim${i}`;
      for (let j = 0; j < salted.length; j++) {
        const char = salted.charCodeAt(j);
        hash = ((hash << 5) - hash + char) | 0;
      }
      // Normalize to [-1, 1] range
      vector.push(Math.sin(hash));
    }

    // L2 normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return norm === 0 ? vector : vector.map((v) => v / norm);
  }
}
