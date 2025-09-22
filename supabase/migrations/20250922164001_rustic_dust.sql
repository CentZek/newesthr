/*
  # Add new HR accounts

  1. New HR Users
    - Add `Rasan` with password `Rasanhr`
    - Add `Sarab` with password `Sarabhr`
  
  2. Security
    - Uses the same hr_users table structure as existing Marilyn account
    - Passwords are stored in plain text as per existing pattern
*/

-- Insert new HR accounts
INSERT INTO hr_users (username, password) 
VALUES 
  ('Rasan', 'Rasanhr'),
  ('Sarab', 'Sarabhr')
ON CONFLICT (username) DO NOTHING;