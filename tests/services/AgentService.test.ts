import { describe, it, expect, beforeEach } from 'vitest';
import { AgentService } from '../../src/services/AgentService.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../src/errors.js';

describe('AgentService', () => {
  let agentService: AgentService;
  let agentRepo: MockAgentRepository;

  beforeEach(() => {
    agentRepo = new MockAgentRepository();
    agentService = new AgentService(agentRepo);
  });

  // ── register ──

  describe('register', () => {
    it('should create an agent and return an API key', async () => {
      const result = await agentService.register({
        displayName: 'TestAgent',
        description: 'A test agent',
      });

      expect(result.displayName).toBe('TestAgent');
      expect(result.description).toBe('A test agent');
      expect(result.id).toBeTruthy();
      expect(result.apiKey).toBeTruthy();
      expect(result.apiKey).toMatch(/^sc_key_/);
    });

    it('should generate a slugified ID from displayName', async () => {
      const result = await agentService.register({
        displayName: 'My Cool Agent 2000',
      });

      // Should be lowercase, hyphenated, with a random suffix
      expect(result.id).toMatch(/^my-cool-agent-2000-[a-z0-9]+$/);
    });

    it('should store the agent with a hashed API key', async () => {
      const result = await agentService.register({
        displayName: 'TestAgent',
      });

      const stored = await agentRepo.findById(result.id);
      expect(stored).not.toBeNull();
      expect(stored!.api_key_hash).not.toBe(result.apiKey);
      expect(stored!.api_key_hash).toBeTruthy();
    });

    it('should set default trust score to 0.5', async () => {
      const result = await agentService.register({
        displayName: 'TestAgent',
      });

      const stored = await agentRepo.findById(result.id);
      expect(stored!.trust_score).toBe(0.5);
    });

    it('should set description to null when not provided', async () => {
      const result = await agentService.register({
        displayName: 'TestAgent',
      });

      expect(result.description).toBeNull();
    });

    it('should generate unique IDs for same displayName', async () => {
      const result1 = await agentService.register({
        displayName: 'TestAgent',
      });
      const result2 = await agentService.register({
        displayName: 'TestAgent',
      });

      expect(result1.id).not.toBe(result2.id);
    });

    it('should reject empty displayName', async () => {
      await expect(
        agentService.register({ displayName: '' })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject displayName exceeding max length', async () => {
      await expect(
        agentService.register({ displayName: 'a'.repeat(101) })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration when same name slug has too many recent registrations', async () => {
      // Register 3 agents with same name (the limit)
      await agentService.register({ displayName: 'SpamBot' });
      await agentService.register({ displayName: 'SpamBot' });
      await agentService.register({ displayName: 'SpamBot' });

      // 4th should be rejected
      await expect(
        agentService.register({ displayName: 'SpamBot' })
      ).rejects.toThrow('Too many registrations');
    });

    it('should allow different display names even when one is throttled', async () => {
      await agentService.register({ displayName: 'SpamBot' });
      await agentService.register({ displayName: 'SpamBot' });
      await agentService.register({ displayName: 'SpamBot' });

      // Different name should still work
      const result = await agentService.register({ displayName: 'LegitAgent' });
      expect(result.displayName).toBe('LegitAgent');
    });
  });

  // ── authenticate ──

  describe('authenticate', () => {
    it('should return the agent for a valid API key', async () => {
      const registered = await agentService.register({
        displayName: 'TestAgent',
        description: 'A test agent',
      });

      const agent = await agentService.authenticate(registered.apiKey);

      expect(agent.id).toBe(registered.id);
      expect(agent.displayName).toBe('TestAgent');
    });

    it('should throw UnauthorizedError for invalid API key', async () => {
      await expect(
        agentService.authenticate('sc_key_bogus')
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for empty API key', async () => {
      await expect(agentService.authenticate('')).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  // ── getById ──

  describe('getById', () => {
    it('should return agent profile with contribution count', async () => {
      const registered = await agentService.register({
        displayName: 'TestAgent',
        description: 'A test agent',
      });

      const profile = await agentService.getById(registered.id);

      expect(profile.id).toBe(registered.id);
      expect(profile.displayName).toBe('TestAgent');
      expect(profile.description).toBe('A test agent');
      expect(profile.trustScore).toBe(0.5);
      expect(profile.contributionCount).toBe(0);
      expect(profile.joinedAt).toBeTruthy();
    });

    it('should throw NotFoundError for non-existent agent', async () => {
      await expect(agentService.getById('nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should include lastActiveAt in profile', async () => {
      const registered = await agentService.register({
        displayName: 'TestAgent',
      });

      // Before any auth, lastActiveAt is null
      const profileBefore = await agentService.getById(registered.id);
      expect(profileBefore.lastActiveAt).toBeNull();

      // Authenticate to trigger lastActive touch
      await agentService.authenticate(registered.apiKey);

      // Wait a tick for fire-and-forget to complete
      await new Promise(r => setTimeout(r, 10));

      const profileAfter = await agentService.getById(registered.id);
      expect(profileAfter.lastActiveAt).toBeTruthy();
    });
  });

  // ── lastActive tracking ──

  describe('lastActive tracking', () => {
    it('should update last_active_at on authenticate', async () => {
      const registered = await agentService.register({
        displayName: 'TestAgent',
      });

      const beforeAuth = await agentRepo.findById(registered.id);
      expect(beforeAuth!.last_active_at).toBeNull();

      await agentService.authenticate(registered.apiKey);
      await new Promise(r => setTimeout(r, 10));

      const afterAuth = await agentRepo.findById(registered.id);
      expect(afterAuth!.last_active_at).toBeTruthy();
    });

    it('should throttle repeated last_active_at updates', async () => {
      const registered = await agentService.register({
        displayName: 'TestAgent',
      });

      await agentService.authenticate(registered.apiKey);
      await new Promise(r => setTimeout(r, 10));

      const afterFirst = await agentRepo.findById(registered.id);
      const firstTimestamp = afterFirst!.last_active_at;

      // Second auth immediately after — should be throttled (same timestamp)
      await agentService.authenticate(registered.apiKey);
      await new Promise(r => setTimeout(r, 10));

      const afterSecond = await agentRepo.findById(registered.id);
      expect(afterSecond!.last_active_at).toBe(firstTimestamp);
    });
  });
});
