-- Add operational manager user to hr_users table
INSERT INTO public.hr_users (username, password) 
VALUES ('Hamza', 'Hamzaom')
ON CONFLICT (username) DO NOTHING;

-- Ensure operational manager can access required tables
-- Existing RLS policies should cover this new user automatically