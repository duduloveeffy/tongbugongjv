-- Create users table extending Supabase auth.users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Create API keys table for secure storage
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.wc_sites(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Modify wc_sites table to remove plain text API keys
ALTER TABLE public.wc_sites
  ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES public.api_keys(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id);

-- Create a view that never exposes API keys
CREATE OR REPLACE VIEW public.wc_sites_safe AS
SELECT
  id,
  name,
  url,
  enabled,
  last_sync_at,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM public.wc_sites;

-- Row Level Security (RLS) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_sites ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile (admins can see all)
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

-- Only admins can update user roles
CREATE POLICY "Only admins can update users" ON public.users
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

-- Audit logs are read-only for everyone except admins
CREATE POLICY "View audit logs based on role" ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'manager')
    )
  );

-- API keys are only accessible by admins and managers
CREATE POLICY "API keys access control" ON public.api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'manager')
    )
  );

-- Sites are viewable by all authenticated users
CREATE POLICY "Sites viewable by authenticated users" ON public.wc_sites
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins and managers can modify sites
CREATE POLICY "Sites modifiable by admins and managers" ON public.wc_sites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'manager')
    )
  );

-- Function to automatically create user record after signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at)
  VALUES (
    new.id,
    new.email,
    CASE
      WHEN new.email = 'admin@example.com' THEN 'admin'  -- Set your admin email
      ELSE 'viewer'
    END,
    NOW()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to encrypt API keys
CREATE OR REPLACE FUNCTION public.encrypt_text(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  -- In production, use a proper encryption key from vault/secrets
  encryption_key := current_setting('app.encryption_key', true);
  IF encryption_key IS NULL THEN
    encryption_key := 'your-32-char-encryption-key-here';
  END IF;

  -- Use pgcrypto for encryption (ensure pgcrypto extension is enabled)
  RETURN encode(encrypt(plain_text::bytea, encryption_key::bytea, 'aes'), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt API keys (only for authorized use)
CREATE OR REPLACE FUNCTION public.decrypt_text(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  encryption_key := current_setting('app.encryption_key', true);
  IF encryption_key IS NULL THEN
    encryption_key := 'your-32-char-encryption-key-here';
  END IF;

  RETURN convert_from(decrypt(decode(encrypted_text, 'base64'), encryption_key::bytea, 'aes'), 'UTF8');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Grant appropriate permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.wc_sites_safe TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;