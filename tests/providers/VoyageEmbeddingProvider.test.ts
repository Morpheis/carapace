import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VoyageEmbeddingProvider } from '../../src/providers/VoyageEmbeddingProvider.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function voyageResponse(embeddings: number[][], model = 'voyage-4-lite') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      object: 'list',
      data: embeddings.map((embedding, index) => ({
        object: 'embedding',
        embedding,
        index,
      })),
      model,
      usage: {
        total_tokens: 10,
      },
    }),
  };
}

function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ detail: message }),
  };
}

describe('VoyageEmbeddingProvider', () => {
  let provider: VoyageEmbeddingProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new VoyageEmbeddingProvider({ apiKey: 'test-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have dimensions of 1024 by default', () => {
    expect(provider.dimensions).toBe(1024);
  });

  it('should support custom dimensions', () => {
    const custom = new VoyageEmbeddingProvider({
      apiKey: 'test-key',
      dimensions: 512,
    });
    expect(custom.dimensions).toBe(512);
  });

  describe('generate', () => {
    it('should call Voyage API and return embedding vector', async () => {
      const fakeEmbedding = [0.1, 0.2, 0.3];
      mockFetch.mockResolvedValueOnce(voyageResponse([fakeEmbedding]));

      const result = await provider.generate('test text');

      expect(result).toEqual(fakeEmbedding);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.voyageai.com/v1/embeddings');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.input).toEqual(['test text']);
      expect(body.model).toBe('voyage-4-lite');
      expect(body.input_type).toBe('document');
    });

    it('should send Authorization header with API key', async () => {
      mockFetch.mockResolvedValueOnce(voyageResponse([[0.1]]));
      await provider.generate('test');

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer test-key');
      expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('should use configured model name', async () => {
      const custom = new VoyageEmbeddingProvider({
        apiKey: 'test-key',
        model: 'voyage-4-large',
      });

      mockFetch.mockResolvedValueOnce(voyageResponse([[0.1]]));
      await custom.generate('test');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('voyage-4-large');
    });

    it('should include output_dimension when non-default', async () => {
      const custom = new VoyageEmbeddingProvider({
        apiKey: 'test-key',
        dimensions: 512,
      });

      mockFetch.mockResolvedValueOnce(voyageResponse([[0.1]]));
      await custom.generate('test');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.output_dimension).toBe(512);
    });

    it('should not include output_dimension for default 1024', async () => {
      mockFetch.mockResolvedValueOnce(voyageResponse([[0.1]]));
      await provider.generate('test');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.output_dimension).toBeUndefined();
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Invalid API key'));

      await expect(provider.generate('test')).rejects.toThrow(
        'Voyage API error (401)'
      );
    });
  });

  describe('generateBatch', () => {
    it('should return empty array for empty input', async () => {
      const result = await provider.generateBatch([]);
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send multiple texts and return ordered embeddings', async () => {
      const embeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
      ];
      mockFetch.mockResolvedValueOnce(voyageResponse(embeddings));

      const result = await provider.generateBatch([
        'text one',
        'text two',
        'text three',
      ]);

      expect(result).toEqual(embeddings);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.input).toEqual(['text one', 'text two', 'text three']);
    });

    it('should handle out-of-order response indices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          object: 'list',
          data: [
            { object: 'embedding', embedding: [0.5, 0.6], index: 2 },
            { object: 'embedding', embedding: [0.1, 0.2], index: 0 },
            { object: 'embedding', embedding: [0.3, 0.4], index: 1 },
          ],
          model: 'voyage-4-lite',
          usage: { total_tokens: 30 },
        }),
      });

      const result = await provider.generateBatch(['a', 'b', 'c']);
      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
      ]);
    });
  });
});
