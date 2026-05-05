-- ============================================================
-- INVEX admin email update + audit trigger fix
-- Supabase Dashboard -> SQL Editor -> Run all
-- ============================================================

-- 1. Update profiles role to admin for all 4 admin accounts
UPDATE public.profiles
SET role = 'admin'
WHERE email IN (
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'sinbi021499@gmail.com',
  'admin@invex.io.kr'
);

-- 2. Fix audit trigger: use COALESCE to handle NULL auth.uid() (SQL Editor context)
CREATE OR REPLACE FUNCTION audit_profile_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs (user_id, action, target, detail)
    VALUES (
      COALESCE(auth.uid(), NEW.id),
      'role_change',
      NEW.id::text,
      '{"old_role":"' || COALESCE(OLD.role,'') || '","new_role":"' || COALESCE(NEW.role,'') || '"}'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Recreate handle_new_user with 4 admin emails
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, photo_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '사용자'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(NEW.email, '')) IN (
        'sinbi0214@naver.com',
        'sinbi850403@gmail.com',
        'sinbi021499@gmail.com',
        'admin@invex.io.kr'
      ) THEN 'admin'
      ELSE 'viewer'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update system_config admin_emails (UPSERT)
INSERT INTO system_config(key, value, description)
VALUES (
  'admin_emails',
  '["sinbi0214@naver.com","sinbi850403@gmail.com","sinbi021499@gmail.com","admin@invex.io.kr"]',
  '관리자 이메일 목록'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Verify
SELECT email, role FROM profiles WHERE email IN (
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'sinbi021499@gmail.com',
  'admin@invex.io.kr'
);
