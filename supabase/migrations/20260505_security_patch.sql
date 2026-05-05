-- ============================================================
-- 20260505 INVEX Security Patch
-- 1. Admin role + plan restore for known admin emails
-- 2. system_config admin_emails update
-- 3. decrypt_rrn / decrypt_account_no role check
-- 4. Materialized View RLS wrapper
-- 5. employees.account_no plaintext nullify
-- 6. vendors.bank_account encryption columns
-- ============================================================

-- ============================================================
-- 1. Admin role & plan restore
-- ============================================================
UPDATE public.profiles
SET
  role = 'admin',
  plan = CASE
    WHEN plan = 'free' THEN 'pro'  -- admin is at least pro
    ELSE plan
  END,
  updated_at = now()
WHERE lower(email) IN (
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'sinbi021499@gmail.com',
  'admin@invex.io.kr'
);

-- ============================================================
-- 2. system_config admin_emails update
-- ============================================================
INSERT INTO public.system_config (key, value, description)
VALUES (
  'admin_emails',
  '["sinbi0214@naver.com","sinbi850403@gmail.com","sinbi021499@gmail.com","admin@invex.io.kr"]'::jsonb,
  'Admin email list — update via Supabase Dashboard'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- ============================================================
-- 3-A. decrypt_rrn — add admin/manager role check
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrypt_rrn(emp_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  rrn_key     TEXT;
  enc_val     BYTEA;
  owner_uid   UUID;
BEGIN
  -- [SECURITY] DB-level role check (cannot be bypassed by client)
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: admin or manager role required';
  END IF;

  -- Ownership check
  SELECT rrn_enc, user_id INTO enc_val, owner_uid
  FROM public.employees WHERE id = emp_id;

  IF owner_uid != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied: you do not own this employee record';
  END IF;

  IF enc_val IS NULL THEN RETURN NULL; END IF;

  rrn_key := current_setting('app.rrn_key', true);
  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE EXCEPTION 'app.rrn_key not configured';
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, action, target, detail)
  VALUES (auth.uid(), 'decrypt_rrn', emp_id::text, 'RRN plaintext viewed');

  RETURN pgp_sym_decrypt(enc_val, rrn_key);
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_rrn(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decrypt_rrn(UUID) TO authenticated;

-- ============================================================
-- 3-B. decrypt_account_no — add admin/manager role check
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrypt_account_no(emp_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  rrn_key     TEXT;
  enc_val     BYTEA;
  owner_uid   UUID;
BEGIN
  -- [SECURITY] DB-level role check
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: admin or manager role required';
  END IF;

  SELECT account_no_enc, user_id INTO enc_val, owner_uid
  FROM public.employees WHERE id = emp_id;

  IF owner_uid != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied: you do not own this employee record';
  END IF;

  IF enc_val IS NULL THEN RETURN NULL; END IF;

  rrn_key := current_setting('app.rrn_key', true);
  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE EXCEPTION 'app.rrn_key not configured';
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, action, target, detail)
  VALUES (auth.uid(), 'decrypt_account_no', emp_id::text, 'Account No plaintext viewed');

  RETURN pgp_sym_decrypt(enc_val, rrn_key);
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_account_no(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decrypt_account_no(UUID) TO authenticated;

-- ============================================================
-- 4. Materialized View RLS — wrap with security_invoker views
-- ============================================================
-- Revoke direct access to MVs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_inventory_summary') THEN
    REVOKE SELECT ON public.mv_inventory_summary FROM authenticated, anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_monthly_profit') THEN
    REVOKE SELECT ON public.mv_monthly_profit FROM authenticated, anon;
  END IF;
END $$;

-- Create user-scoped wrapper views
CREATE OR REPLACE VIEW public.v_my_inventory_summary
WITH (security_invoker = true)
AS
  SELECT * FROM public.mv_inventory_summary
  WHERE user_id = auth.uid();

CREATE OR REPLACE VIEW public.v_my_monthly_profit
WITH (security_invoker = true)
AS
  SELECT * FROM public.mv_monthly_profit
  WHERE user_id = auth.uid();

GRANT SELECT ON public.v_my_inventory_summary TO authenticated;
GRANT SELECT ON public.v_my_monthly_profit    TO authenticated;

-- ============================================================
-- 5. employees.account_no — nullify any remaining plaintext rows
-- ============================================================
-- First encrypt any rows where enc is missing but plaintext exists
-- (requires app.rrn_key to be set in the session)
UPDATE public.employees
SET account_no = NULL
WHERE account_no IS NOT NULL AND account_no_enc IS NOT NULL;

-- Report rows that still have plaintext (enc also null — need manual migration)
DO $$
DECLARE
  cnt INT;
BEGIN
  SELECT count(*) INTO cnt FROM public.employees WHERE account_no IS NOT NULL AND account_no_enc IS NULL;
  IF cnt > 0 THEN
    RAISE WARNING 'SECURITY: % employee rows still have plaintext account_no with no enc. Run set_employee_account_no RPC for each.', cnt;
  END IF;
END $$;

-- ============================================================
-- 6. vendors.bank_account — add encrypted columns
-- ============================================================
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS bank_account_enc  BYTEA,
  ADD COLUMN IF NOT EXISTS bank_account_mask TEXT;

-- Note: Encrypt existing data with:
-- SET app.rrn_key = 'your-key';
-- UPDATE vendors
--   SET bank_account_enc  = pgp_sym_encrypt(bank_account, current_setting('app.rrn_key')),
--       bank_account_mask = CASE
--         WHEN length(regexp_replace(bank_account,'[^0-9]','','g')) >= 8
--         THEN left(regexp_replace(bank_account,'[^0-9]','','g'),4)||'****'
--              ||right(regexp_replace(bank_account,'[^0-9]','','g'),4)
--         ELSE repeat('*', length(bank_account)) END
--   WHERE bank_account IS NOT NULL;
-- Then: UPDATE vendors SET bank_account = NULL WHERE bank_account_enc IS NOT NULL;
