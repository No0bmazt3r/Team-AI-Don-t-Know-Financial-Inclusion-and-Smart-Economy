# The API's configuration on AWS. Committed, so nothing secret here: keys, passwords and emails go in the
# coinvoy/api secret (README → Deployment). Every name in backend/.env.example is accepted.

# The app's address. First apply: leave as is; then paste the "app_url" output here and apply again.
app_url = "https://pending.invalid"

# Must all exist in the secret, or the container won't start. Drop a line here if you don't use that key.
secret_keys = [
  "AI_KEYS_MASTER_KEY", # openssl rand -base64 32; AI providers and keys themselves are managed in /admin/ai
  "GOOGLE_CLIENT_SECRET",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "ADMIN_EMAILS",
  "PRIVACY_CONTACT_EMAIL",
]

app_env = {
  GOOGLE_CLIENT_ID = "260290154823-dfbdnvevefr1duib9ir436s82kn8cphj.apps.googleusercontent.com"
  DEMO_ENABLED     = "true"
  SESSION_TTL_DAYS = "7"
  LOG_REQUESTS     = "true"
  VAPID_SUBJECT    = "mailto:admin@coinvoy.invalid"
}
