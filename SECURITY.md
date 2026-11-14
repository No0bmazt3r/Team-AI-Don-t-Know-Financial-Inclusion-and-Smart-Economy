# Security policy

Coinvoy handles gig riders' earnings and personal details, so we take security reports seriously. Thank you for helping keep riders safe.

## Supported versions

Only the latest code on `main` (and the version deployed from it) gets security fixes.

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub instead:

1. Go to this repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what an attacker could do with it.

Only the maintainers can see the report. We aim to acknowledge it within 7 days, keep you updated while we fix it, and credit you in the advisory if you'd like.

## What counts

In scope, for example:
- Seeing or changing another rider's data
- Getting around sign-in, sessions, the Origin check or rate limits
- Making Odah Bot show a number that didn't come from the engine (getting around the number guard)
- Prompt injection that makes Snap, Odah Bot or the lender check act on instructions hidden in an image or message
- Officer links that can be guessed, reused after revoking, or indexed
- Leaked secrets in the code or its history

Out of scope:
- Denial-of-service or load testing against the live deployment
- Social engineering of the team or riders
- Missing security headers with no demonstrated impact
- Problems in third-party services (Google, AI providers, AWS): please report those to them

## Please

- Test only against your own local copy or your own accounts. Never access real riders' data.
- Give us reasonable time to fix the problem before you disclose it publicly.
