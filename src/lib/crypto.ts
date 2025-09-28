import crypto from 'crypto';

// Get encryption key from environment or use default (NOT FOR PRODUCTION)
const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!';

  // Ensure key is 32 characters for AES-256
  if (key.length < 32) {
    return key.padEnd(32, '0');
  }
  return key.substring(0, 32);
};

// Encrypt text using AES-256
export async function encrypt_text(plainText: string): Promise<string> {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // Initialization vector

    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data (IV is needed for decryption)
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

// Decrypt text
export async function decrypt_text(encryptedData: string): Promise<string> {
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');

    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

// Hash password using bcrypt-like approach
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Verify password
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [salt, originalHash] = storedHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

// Generate secure random token
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Generate API key pair
export function generateApiKeyPair(): { key: string; secret: string } {
  return {
    key: `pk_${generateToken(24)}`,
    secret: `sk_${generateToken(32)}`
  };
}

// Mask sensitive data for display
export function maskSensitiveData(data: string, showChars: number = 4): string {
  if (!data || data.length <= showChars * 2) {
    return '****';
  }

  const start = data.substring(0, showChars);
  const end = data.substring(data.length - showChars);
  const masked = '*'.repeat(Math.max(4, data.length - showChars * 2));

  return `${start}${masked}${end}`;
}

// Sanitize input to prevent injection attacks
export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Generate CSRF token
export function generateCSRFToken(): string {
  return generateToken(32);
}

// Verify CSRF token
export function verifyCSRFToken(token: string, storedToken: string): boolean {
  if (!token || !storedToken) return false;

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(storedToken)
  );
}