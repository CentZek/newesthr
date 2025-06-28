/*
  # Add Operational Manager authentication support
  
  1. Changes:
    - Add the Hamza user to hr_users table
    - Create database migration to ensure proper access and authentication
    
  2. Note:
    - Using the hr_users table for Operational Manager users for simplicity
    - In a production environment, may want to create separate tables and roles
*/

-- Add operational manager user to hr_users table
INSERT INTO public.hr_users (username, password) 
VALUES ('Hamza', 'Hamzaom')
ON CONFLICT (username) DO NOTHING;