import { firebaseConfig } from "./auth-config.js";
import { getFirebaseClient } from "./firebase-client.js";
const $ = (id) => document.getElementById(id);
const dialog = $("authDialog");
let mode = "signin",
  sdk,
  auth;
let initialized = false;
const ready = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);
function setMode(next) {
  mode = next;
  $("signInTab").setAttribute("aria-pressed", String(next === "signin"));
  $("signUpTab").setAttribute("aria-pressed", String(next === "signup"));
  $("authTitle").textContent =
    next === "signup" ? "Make yourself at home." : "Good to see you.";
  $("emailLogin").textContent =
    next === "signup" ? "Create account" : "Sign in";
  $("authPassword").autocomplete =
    next === "signup" ? "new-password" : "current-password";
  $("authNameField").hidden = next !== "signup";
}
$("signInTab").onclick = () => setMode("signin");
$("signUpTab").onclick = () => setMode("signup");
$("signInTab").disabled = false;
$("signUpTab").disabled = false;
function busy(value) {
  for (const id of [
    "googleLogin",
    "emailLogin",
    "signInTab",
    "signUpTab",
    "resetPassword",
    "introSignOut",
  ])
    $(id).disabled =
      value || (!["signInTab", "signUpTab"].includes(id) && !initialized);
}
function showError(error) {
  const messages = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/email-already-in-use":
      "An account already uses that email. Try signing in.",
    "auth/weak-password":
      "Choose a stronger password with at least eight characters.",
    "auth/popup-closed-by-user": "Sign-in was closed. You can try again.",
    "auth/popup-blocked": "Allow pop-ups for this site, then try again.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/unauthorized-domain":
      "This website address is not authorized. Add its hostname in Firebase Authentication settings.",
    "auth/operation-not-allowed":
      "Enable this sign-in method in Firebase Authentication.",
    "auth/invalid-api-key": "Check the apiKey value in auth-config.js.",
    "auth/network-request-failed": "Check your connection, then try again.",
  };
  $("authStatus").textContent =
    messages[error.code] ||
    "Sign-in is unavailable right now. Try again or continue without an account.";
}
async function initializeAuth() {
  const client = await getFirebaseClient();
  sdk = client.authSDK;
  auth = client.auth;
  initialized = true;
  busy(false);
  $("authStatus").textContent = "Sign in with Google or use your email.";
  sdk.onAuthStateChanged(auth, (user) => {
    const signedIn = Boolean(user?.emailVerified);
    $("introAccount").hidden = !signedIn;
    $("introLoginFields").hidden = signedIn;
    $("introAccountEmail").textContent = signedIn ? user.email || "" : "";
    $("openLogin").textContent = signedIn ? "My account" : "Log in / Sign up";
  });
}
if (ready) {
  $("authStatus").textContent = "Loading secure sign-in…";
  initializeAuth().catch(showError);
}
$("googleLogin").onclick = async () => {
  if (!auth) return;
  busy(true);
  try {
    await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
    location.assign(new URL("./index.html", location.href));
  } catch (error) {
    showError(error);
  } finally {
    busy(false);
  }
};
$("authForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!auth) return;
  busy(true);
  try {
    const email = $("authEmail").value.trim(),
      password = $("authPassword").value;
    if (mode === "signup") {
      const { user } = await sdk.createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      if ($("authName").value.trim())
        await sdk.updateProfile(user, {
          displayName: $("authName").value.trim(),
        });
      await sdk.sendEmailVerification(user);
      await sdk.signOut(auth);
      $("authStatus").textContent =
        "Check your email to verify your account, then sign in here.";
      setMode("signin");
    } else {
      const { user } = await sdk.signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      if (!user.emailVerified) {
        await sdk.signOut(auth);
        $("authStatus").textContent =
          "Verify your email using the link we sent before signing in.";
      } else location.assign(new URL("./index.html", location.href));
    }
  } catch (error) {
    showError(error);
  } finally {
    $("authPassword").value = "";
    busy(false);
  }
};
$("resetPassword").onclick = async () => {
  if (!initialized || !$("authEmail").reportValidity()) return;
  busy(true);
  try {
    await sdk.sendPasswordResetEmail(auth, $("authEmail").value.trim());
    $("authStatus").textContent =
      "If this email has an account, check your inbox for a password reset link.";
  } catch (error) {
    showError(error);
  } finally {
    busy(false);
  }
};
$("introSignOut").onclick = async () => {
  busy(true);
  try {
    await sdk.signOut(auth);
    $("authStatus").textContent = "You’re signed out.";
  } catch (error) {
    showError(error);
  } finally {
    busy(false);
  }
};
