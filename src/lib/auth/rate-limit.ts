import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Initialize Redis client if configured
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

interface RateLimitConfig {
  requests: number;    // Number of requests allowed
  window: number;      // Time window in seconds
  identifier?: string; // Custom identifier (default: IP address)
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// Default rate limit configurations
export const RateLimits = {
  // General API rate limit
  API: { requests: 60, window: 60 },        // 60 requests per minute

  // Auth endpoints
  LOGIN: { requests: 5, window: 900 },      // 5 login attempts per 15 minutes
  REGISTER: { requests: 3, window: 3600 },  // 3 registrations per hour

  // Data operations
  SYNC: { requests: 10, window: 300 },      // 10 sync operations per 5 minutes
  EXPORT: { requests: 5, window: 300 },     // 5 exports per 5 minutes

  // Sensitive operations
  API_KEY: { requests: 3, window: 3600 },   // 3 API key operations per hour
  DELETE: { requests: 5, window: 3600 },    // 5 delete operations per hour
} as const;

// Rate limiting function
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // If Redis is not configured, allow all requests (fallback mode)
  if (!redis) {
    console.warn('Rate limiting disabled - Redis not configured');
    return {
      success: true,
      limit: config.requests,
      remaining: config.requests,
      reset: Date.now() + config.window * 1000,
    };
  }

  try {
    // Get identifier (IP address or custom)
    const identifier = config.identifier || getClientIp(request) || 'unknown';

    // Create a unique key for this rate limit
    const key = `rate_limit:${identifier}:${request.nextUrl.pathname}`;

    // Get current count and TTL
    const pipe = redis.pipeline();
    pipe.incr(key);
    pipe.expire(key, config.window);
    pipe.ttl(key);

    const results = await pipe.exec();
    const count = results[0] as number;
    const ttl = results[2] as number;

    // Calculate reset time
    const reset = Date.now() + (ttl > 0 ? ttl * 1000 : config.window * 1000);

    // Check if limit exceeded
    const remaining = Math.max(0, config.requests - count);
    const success = count <= config.requests;

    return {
      success,
      limit: config.requests,
      remaining,
      reset,
    };
  } catch (error) {
    console.error('Rate limiting error:', error);
    // On error, allow the request (fail open)
    return {
      success: true,
      limit: config.requests,
      remaining: config.requests,
      reset: Date.now() + config.window * 1000,
    };
  }
}

// Middleware for rate limiting
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = RateLimits.API
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const result = await rateLimit(request, config);

    // Add rate limit headers to response
    const response = !result.success
      ? NextResponse.json(
          {
            error: 'Too many requests',
            message: 'Please try again later',
            retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
          },
          { status: 429 }
        )
      : await handler(request);

    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', result.limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.reset.toString());

    return response;
  };
}

// Account lockout for failed login attempts
export async function checkAccountLockout(email: string): Promise<{
  isLocked: boolean;
  remainingTime?: number;
}> {
  if (!redis) {
    return { isLocked: false };
  }

  try {
    const key = `lockout:${email}`;
    const lockoutTime = await redis.get(key);

    if (lockoutTime) {
      const remaining = Number(lockoutTime) - Date.now();
      if (remaining > 0) {
        return {
          isLocked: true,
          remainingTime: Math.ceil(remaining / 1000),
        };
      }
    }

    return { isLocked: false };
  } catch (error) {
    console.error('Lockout check error:', error);
    return { isLocked: false };
  }
}

// Record failed login attempt
export async function recordFailedLogin(email: string): Promise<{
  attempts: number;
  lockout: boolean;
}> {
  if (!redis) {
    return { attempts: 1, lockout: false };
  }

  try {
    const attemptKey = `login_attempts:${email}`;
    const lockoutKey = `lockout:${email}`;

    // Increment attempt counter
    const attempts = await redis.incr(attemptKey);

    // Set expiry for attempt counter (15 minutes)
    if (attempts === 1) {
      await redis.expire(attemptKey, 900);
    }

    // Lock account after 5 failed attempts
    if (attempts >= 5) {
      const lockoutTime = Date.now() + 15 * 60 * 1000; // 15 minutes
      await redis.set(lockoutKey, lockoutTime, { ex: 900 });
      await redis.del(attemptKey); // Reset counter

      return { attempts, lockout: true };
    }

    return { attempts, lockout: false };
  } catch (error) {
    console.error('Failed login recording error:', error);
    return { attempts: 1, lockout: false };
  }
}

// Clear failed login attempts (on successful login)
export async function clearFailedLoginAttempts(email: string): Promise<void> {
  if (!redis) return;

  try {
    await redis.del(`login_attempts:${email}`);
    await redis.del(`lockout:${email}`);
  } catch (error) {
    console.error('Clear login attempts error:', error);
  }
}

// Get client IP address
function getClientIp(request: NextRequest): string | null {
  // Check various headers for IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  return null;
}

// DDoS protection - track request patterns
export async function detectAnomalousActivity(
  identifier: string,
  threshold: number = 100
): Promise<boolean> {
  if (!redis) return false;

  try {
    const key = `anomaly:${identifier}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 60); // 1 minute window
    }

    return count > threshold;
  } catch (error) {
    console.error('Anomaly detection error:', error);
    return false;
  }
}

// Combine rate limiting with authentication
export function withAuthAndRateLimit(
  handler: (request: NextRequest, user: any) => Promise<NextResponse>,
  rateLimitConfig: RateLimitConfig = RateLimits.API,
  authOptions?: any
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // First check rate limit
    const rateLimitResult = await rateLimit(request, rateLimitConfig);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
        },
        { status: 429 }
      );
    }

    // Then check authentication
    const { withAuth } = await import('./middleware');
    return withAuth(handler, authOptions?.protectionLevel, authOptions?.permissions)(request);
  };
}