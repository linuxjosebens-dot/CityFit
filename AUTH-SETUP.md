# CityFit accounts

The intro page is `intro.html`. The local server serves it at `/`; the existing
planner stays at `/index.html`. Every Open CityFit button goes to that planner.
On a static host, set `intro.html` as the entry document or link to it directly.

## Enable Firebase Authentication

1. Create a Firebase project and register a Web app:
   https://firebase.google.com/docs/web/setup
2. In Authentication > Sign-in method, enable Email/Password and Google.
   Select a project support email for Google sign-in.
3. Copy the public Web configuration into `auth-config.js` (apiKey,
   authDomain, projectId, appId). Firebase web configuration is public;
   never put a service-account key, admin credentials or OAuth client secret
   in browser files.
4. In Authentication > Settings > Authorized domains, add your deployed
   hostname and localhost for testing. Use HTTPS on your production domain.
5. Test account creation, the verification email, email/password sign-in,
   Google popup sign-in, cancellation and invalid passwords on that domain.

Implementation follows Firebase's Google and password authentication APIs:
https://firebase.google.com/docs/auth/web/google-signin
https://firebase.google.com/docs/auth/web/password-auth
The browser SDK is pinned to 12.19.0 and loaded only when configured.

Before configuration, the dialog explains that accounts are not enabled,
keeps authentication submission disabled and offers guest access. No fake
account or password is stored in CityFit browser storage.

Email accounts require email verification before this sign-in flow proceeds.
Account creation sends a verification link. Google sign-in is handled by
Google/Firebase. The current app remains accessible without authentication;
accounts do not yet protect the planner or synchronize its local data.
Add Firebase security rules and server-side token verification before adding
private cloud data or protected server endpoints.

## Google two-step verification

Google owns its account challenge and may apply the user's existing security
settings. CityFit cannot turn on or force Google-account 2-Step Verification
for personal Gmail accounts. The dialog links to Google Account security so
users can manage it themselves:
https://support.google.com/accounts/answer/185839

This integration does not implement a separate CityFit MFA challenge. If you
want mandatory app-level MFA, design it using an identity provider that
supports enforcement, enrollment and recovery before restricting access.
