import { RetryPolicy, RetryStrategy } from './entities/retry-policy.entity';

describe('RetryPolicy Entity', () => {
  let policy: RetryPolicy;

  beforeEach(() => {
    policy = new RetryPolicy();
    policy.baseDelayMs = 1000;
    policy.maxAttempts = 3;
    policy.maxDelayMs = 10000; // 10s cap
  });

  it('should calculate FIXED delay correctly', () => {
    policy.strategy = RetryStrategy.FIXED;

    expect(policy.calculateDelay(1)).toBe(1000);
    expect(policy.calculateDelay(2)).toBe(1000);
    expect(policy.calculateDelay(3)).toBe(1000);
  });

  it('should calculate LINEAR delay correctly', () => {
    policy.strategy = RetryStrategy.LINEAR;

    expect(policy.calculateDelay(1)).toBe(1000); // 1 * 1000
    expect(policy.calculateDelay(2)).toBe(2000); // 2 * 1000
    expect(policy.calculateDelay(3)).toBe(3000); // 3 * 1000
  });

  it('should calculate EXPONENTIAL delay correctly', () => {
    policy.strategy = RetryStrategy.EXPONENTIAL;

    expect(policy.calculateDelay(1)).toBe(1000); // 1000 * 2^0
    expect(policy.calculateDelay(2)).toBe(2000); // 1000 * 2^1
    expect(policy.calculateDelay(3)).toBe(4000); // 1000 * 2^2
    expect(policy.calculateDelay(4)).toBe(8000); // 1000 * 2^3
  });

  it('should cap delay at maxDelayMs', () => {
    policy.strategy = RetryStrategy.EXPONENTIAL;
    policy.maxDelayMs = 5000; // 5s cap

    expect(policy.calculateDelay(1)).toBe(1000);
    expect(policy.calculateDelay(2)).toBe(2000);
    expect(policy.calculateDelay(3)).toBe(4000);
    expect(policy.calculateDelay(4)).toBe(5000); // Capped at 5000
    expect(policy.calculateDelay(5)).toBe(5000); // Capped at 5000
  });
});
