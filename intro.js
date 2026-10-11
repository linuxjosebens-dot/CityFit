import { firebaseConfig } from "./auth-config.js";
const $ = (id) => document.getElementById(id);
const dialog = $("authDialog");
let mode = "signin",
  sdk,
  auth;
const ready = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);
$("openLogin").onclick = () => dialog.showModal();
$("closeLogin").onclick = () => dialog.close();
dialog.addEventListener("close", () => $("openLogin").focus());
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
}
$("signInTab").onclick = () => setMode("signin");
$("signUpTab").onclick = () => setMode("signup");
function busy(value) {
  for (const id of ["googleLogin", "emailLogin", "signInTab", "signUpTab"])
    $(id).disabled = value || !ready;
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
  };
  $("authStatus").textContent =
    messages[error.code] ||
    "Sign-in is unavailable right now. Try again or continue without an account.";
}
async function initializeAuth() {
  const [app, authModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
  ]);
  sdk = authModule;
  auth = sdk.getAuth(app.initializeApp(firebaseConfig));
  busy(false);
  $("authStatus").textContent =
    "Your shift data remains stored on this device.";
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
    location.assign("https://linuxjosebens-dot.github.io/CityFit/");
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
      } else location.assign("https://linuxjosebens-dot.github.io/CityFit/");
    }
  } catch (error) {
    showError(error);
  } finally {
    $("authPassword").value = "";
    busy(false);
  }
};
