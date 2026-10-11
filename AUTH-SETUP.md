# Set up Firebase login for CityFit

This version uses **email/password and Google sign-in**, with email verification
for email accounts. You do not need your own account server. Firebase works with
GitHub Pages. The setup below does not require Google Authenticator or app-level 2FA.

## 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Sign in with your Google account.
3. Click **Create a project** (sometimes called **Add project**).
4. Name it **CityFit** and continue.
5. If Google Analytics is offered, turn it off for this setup.
6. Finish creating the project, then open it.

## 2. Register CityFit as a web app

1. On the project overview, click the **</>** web icon.
   If it is not visible, open the gear icon → **Project settings** →
   **General** → **Your apps** → **Add app** → **Web**.
2. Enter **CityFit Web** as the app nickname.
3. Leave **Firebase Hosting** unchecked if you are keeping GitHub Pages.
4. Click **Register app**.
5. Find the code that starts with `const firebaseConfig = { ... }`.
   Keep this page open—you will copy four values next.

## 3. Paste four values into CityFit

Open **auth-config.js** in your editor. Replace the empty quotes with the
matching values from Firebase. Keep `export const firebaseConfig` as written.

```js
export const firebaseConfig = {
  apiKey: "PASTE YOUR apiKey HERE",
  authDomain: "PASTE YOUR authDomain HERE",
  projectId: "PASTE YOUR projectId HERE",
  appId: "PASTE YOUR appId HERE",
};
```

**Save the file.** Copy the actual values, not these example placeholders.
You do not need `measurementId`, `storageBucket`, or `messagingSenderId` for login.
These four web settings are public configuration and can be committed. Do not
paste a service-account JSON file, private key, or OAuth client secret here.

To find the values later: gear icon → **Project settings** → **General** →
**Your apps** → your web app → **SDK setup and configuration** → **Config**.

## 4. Enable email and Google login

1. In the left menu, open **Build → Authentication**.
   Some console layouts list **Authentication** directly.
2. Click **Get started** if shown.
3. Open **Sign-in method**.
4. Choose **Email/Password**, enable **Email/Password**, then **Save**.
   Leave **Email link (passwordless sign-in)** off.
5. Choose **Google**, enable it, select your email as the **Project support email**,
   then **Save**.

## 5. Allow your website addresses

In **Authentication → Settings → Authorized domains**, use **Add domain** for:

- `localhost` — local testing.
- `127.0.0.1` — only if you test using this address.
- `linuxjosebens-dot.github.io` — your GitHub Pages website.
- `cityfit.new` — your custom domain, if you use it.
- `www.cityfit.new` — only if the site also opens at this address.

Enter just the hostname. **Do not include `https://`, `/CityFit/`, or a port.**
Do not replace `authDomain` in the code with your website hostname; keep the
value Firebase gave you. New projects may need `localhost` added manually.

## 6. Test it on your computer

In the **CityFit** terminal:

```sh
npm start
```

1. Open **http://localhost:8080**.
2. Click **Log in / Sign up**.
3. Click **Create account**, enter your email and a password of at least eight
   characters, then submit.
4. Open the verification email from Firebase and click its link. Check spam too.
5. Return to CityFit, choose **Sign in**, and use the same email/password.
6. Test **Continue with Google** as well. Allow the sign-in popup if prompted.

Successful sign-in opens the planner. Confirm the new account appears under
**Firebase Console → Authentication → Users**.

## 7. Put it on your website

Once local login works, commit your changes in the CityFit repository and push
to GitHub. Wait for the **Deploy static content to Pages** workflow to finish.
Open your site's **intro.html** page and repeat the login test there.

No separate Node account server or Identity Platform upgrade is needed for this
email/Google setup. Your existing website hosting can stay as it is.

## If something does not work

| What you see                             | What to check                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Login buttons are disabled               | Save all four real values in `auth-config.js`, then reload.                                        |
| “This website address is not authorized” | Add the hostname in step 5.                                                                        |
| “Enable this sign-in method”             | Enable Email/Password or Google in step 4.                                                         |
| Google popup closes or is blocked        | Allow popups, then try again.                                                                      |
| No verification email                    | Check spam; verify the email spelling. Check Authentication → Users to confirm the account exists. |
| “Verify your email”                      | Open the verification link, then sign in again.                                                    |
| Works locally but not on your website    | Confirm the deployed `auth-config.js` contains your values and the live hostname is authorized.    |

## Your profile

No extra Firebase setup is needed. After signing in, open the planner and click
your name/profile button at the top right. The panel on the right shows your
Firebase name, photo (if provided), email, sign-in method, verification status,
and account creation date. Use **Sign out** to end the session.

Plans, saved locations, checklist progress, and shift logs continue to save in
this browser only. The profile shows counts of these browser records. They are
not uploaded, synchronized, or separated by account. Signing out does not delete
them. Firebase Authentication is the only account service used—no Firestore,
database rules, or additional services are required.

Google's own 2-Step Verification follows the user's Google account settings.
A separate CityFit authenticator-code challenge is not enabled.

Official reference: [Firebase Authentication](https://firebase.google.com/docs/auth/web/start).
