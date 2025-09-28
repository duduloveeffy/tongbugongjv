// Authentication types and interfaces

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  last_login?: string;
}

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  VIEWER = 'viewer'
}

export interface Session {
  user: User;
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export interface AuthContext {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
}

// Permission definitions
export const Permissions = {
  // Site management
  SITE_CREATE: 'site:create',
  SITE_READ: 'site:read',
  SITE_UPDATE: 'site:update',
  SITE_DELETE: 'site:delete',

  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_SYNC: 'inventory:sync',
  INVENTORY_UPDATE: 'inventory:update',

  // Sales
  SALES_READ: 'sales:read',
  SALES_SYNC: 'sales:sync',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',

  // API Keys
  API_KEY_READ: 'api_key:read',
  API_KEY_CREATE: 'api_key:create',
  API_KEY_DELETE: 'api_key:delete',
} as const;

export type Permission = typeof Permissions[keyof typeof Permissions];

// Role-Permission mapping
export const RolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: Object.values(Permissions), // Admin has all permissions

  [UserRole.MANAGER]: [
    Permissions.SITE_READ,
    Permissions.INVENTORY_READ,
    Permissions.INVENTORY_SYNC,
    Permissions.INVENTORY_UPDATE,
    Permissions.SALES_READ,
    Permissions.SALES_SYNC,
    Permissions.SETTINGS_READ,
  ],

  [UserRole.VIEWER]: [
    Permissions.SITE_READ,
    Permissions.INVENTORY_READ,
    Permissions.SALES_READ,
    Permissions.SETTINGS_READ,
  ],
};

// API Route protection levels
export enum ProtectionLevel {
  PUBLIC = 'public',        // No authentication required
  AUTHENTICATED = 'authenticated',  // Must be logged in
  AUTHORIZED = 'authorized', // Must have specific permissions
}

export interface RouteProtection {
  level: ProtectionLevel;
  permissions?: Permission[];
}