-- First-party seeded OAuth clients should show "Verified by par Noir" on consent UI.
UPDATE oauth_clients
SET verified = true, updated_at = NOW()
WHERE registry_source = 'seed'
  AND client_id IN ('browser-app', 'prism-app', 'developer-portal', 'licensing-portal');
