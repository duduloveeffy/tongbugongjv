# Security Implementation Guide

## Overview

This document describes the security measures implemented in the ERP Inventory Analysis System to prevent data leakage and unauthorized access.

## Security Features Implemented

### 1. Authentication & Authorization

#### User Authentication
- **Supabase Auth Integration**: Secure user authentication using Supabase
- **Session Management**: Secure cookie-based sessions with automatic expiry
- **Password Security**: PBKDF2 hashing with salt for password storage

#### Role-Based Access Control (RBAC)
Three user roles with different permission levels:

| Role | Permissions |
|------|------------|
| **Admin** | Full access to all features including site management, API key management, and user management |
| **Manager** | Can view and sync data, manage inventory, but cannot manage sites or API keys |
| **Viewer** | Read-only access to inventory and sales data |

### 2. API Security

#### Protected Routes
All sensitive API routes are now protected with authentication middleware:

```typescript
// Example: Protected API route
import { withAuth } from '@/lib/auth/middleware';
import { Permissions, ProtectionLevel } from '@/lib/auth/types';

export const GET = withAuth(
  async (request, user) => {
    // Handler code here
  },
  ProtectionLevel.AUTHORIZED,
  [Permissions.SALES_READ]
);
```

#### API Endpoints Security Status

| Endpoint | Protection Level | Required Permissions |
|----------|-----------------|---------------------|
| `/api/sites/protected/*` | ✅ Protected | SITE_READ, SITE_CREATE, etc. |
| `/api/sales-analysis/protected/*` | ✅ Protected | SALES_READ |
| `/api/sync/*` | ⚠️ Needs Protection | INVENTORY_SYNC |
| `/api/wc-*` | ⚠️ Needs Protection | Various |

### 3. Data Encryption

#### API Key Storage
- API keys are encrypted using AES-256-CBC before database storage
- Keys are never exposed in API responses
- Masked display for sensitive data (e.g., `pk_abcd****wxyz`)

#### Encryption Implementation
```typescript
import { encrypt_text, decrypt_text } from '@/lib/crypto';

// Encrypt before storing
const encryptedKey = await encrypt_text(apiKey);

// Decrypt only when needed (server-side only)
const decryptedKey = await decrypt_text(encryptedKey);
```

### 4. Rate Limiting

Prevents brute force attacks and API abuse:

| Operation | Limit | Window |
|-----------|-------|--------|
| General API | 60 requests | 1 minute |
| Login | 5 attempts | 15 minutes |
| Registration | 3 attempts | 1 hour |
| Data Sync | 10 operations | 5 minutes |
| API Key Operations | 3 operations | 1 hour |

#### Account Lockout
- Account locks after 5 failed login attempts
- 15-minute lockout period
- Automatic unlock after timeout

### 5. Audit Logging

All sensitive operations are logged:
- User authentication events
- API key access
- Data modifications
- Failed access attempts
- Permission violations

#### Audit Log Structure
```typescript
{
  user_id: string,
  action: string,
  resource: string,
  details: {
    ip_address: string,
    user_agent: string,
    // Additional context
  },
  created_at: timestamp
}
```

### 6. Database Security

#### Row Level Security (RLS)
- Enabled on all sensitive tables
- Users can only access data they're authorized for
- Automatic enforcement at database level

#### Secure Views
- `wc_sites_safe`: Never exposes API keys
- API keys stored in separate encrypted table

## Migration Guide

### Step 1: Run Database Migrations

```bash
# Apply the security migrations
npx supabase migration up
```

### Step 2: Update Environment Variables

Add to `.env.local`:
```env
# Encryption key (32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key

# Rate limiting (optional)
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Update API Calls

Replace unprotected API calls with protected versions:

```typescript
// Old (unprotected)
const response = await fetch('/api/sites');

// New (protected)
const response = await fetch('/api/sites/protected', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`
  }
});
```

### Step 4: Migrate Existing Data

1. **Move API Keys to Secure Storage**
   - Export existing sites with API keys
   - Re-import using encrypted storage
   - Remove plain text keys from database

2. **Create Admin User**
   - Register first user (automatically gets viewer role)
   - Manually update role to 'admin' in database
   - Or set admin email in migration script

## Security Best Practices

### For Developers

1. **Never expose sensitive data in client-side code**
   - API keys should only exist server-side
   - Use environment variables for secrets

2. **Always use protected API routes**
   - Import `withAuth` middleware
   - Specify required permissions

3. **Validate and sanitize all inputs**
   ```typescript
   import { sanitizeInput } from '@/lib/crypto';
   const cleanInput = sanitizeInput(userInput);
   ```

4. **Log security events**
   ```typescript
   await logAuditEvent(user.id, 'ACTION', 'resource', details);
   ```

### For Administrators

1. **Regular Security Audits**
   - Review audit logs weekly
   - Check for unusual access patterns
   - Monitor failed login attempts

2. **User Management**
   - Assign minimum required permissions
   - Regularly review user roles
   - Disable inactive accounts

3. **API Key Rotation**
   - Rotate API keys every 90 days
   - Immediately revoke compromised keys
   - Use separate keys for different environments

4. **Backup Security**
   - Encrypt database backups
   - Store backups in secure location
   - Test restore procedures regularly

## Incident Response

### If a Security Breach is Suspected

1. **Immediate Actions**
   - Revoke all API keys
   - Force logout all users
   - Enable maintenance mode

2. **Investigation**
   - Review audit logs
   - Check for unauthorized data access
   - Identify attack vector

3. **Recovery**
   - Reset all passwords
   - Generate new API keys
   - Apply security patches

4. **Post-Incident**
   - Document incident
   - Update security measures
   - Notify affected users if required

## Testing Security

### Manual Testing

1. **Authentication Tests**
   ```bash
   # Test unauthorized access
   curl -X GET http://localhost:3000/api/sites/protected
   # Should return 401 Unauthorized
   ```

2. **Rate Limiting Tests**
   ```bash
   # Send multiple requests quickly
   for i in {1..100}; do
     curl -X GET http://localhost:3000/api/sites/protected
   done
   # Should get 429 Too Many Requests after limit
   ```

3. **Permission Tests**
   - Login as viewer role
   - Try to create/modify data
   - Should get 403 Forbidden

### Automated Security Scanning

Consider using:
- **OWASP ZAP**: Web application security scanner
- **npm audit**: Check for vulnerable dependencies
- **Snyk**: Security vulnerability scanning

## Compliance Considerations

### GDPR Compliance
- User data encryption ✅
- Audit logging ✅
- Data access controls ✅
- Right to deletion (needs implementation)

### PCI Compliance (if handling payments)
- API key encryption ✅
- Access logging ✅
- Regular security updates
- Network segmentation

## Support

For security concerns or questions:
1. Create a private security issue in the repository
2. Contact the security team
3. Never post security vulnerabilities publicly

## Changelog

### Version 1.0.0 (2025-01-13)
- Initial security implementation
- Added authentication middleware
- Implemented RBAC
- Added rate limiting
- Encrypted API key storage
- Audit logging system

---

**Remember**: Security is an ongoing process. Regular updates and vigilance are required to maintain a secure system.