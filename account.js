import { getFirebaseClient } from "./firebase-client.js";
export async function initializeAccount() {
  const $ = (id) => document.getElementById(id);
  const dialog = $("profileDialog");
  $("profileButton").onclick = () => dialog.showModal();
  $("closeProfile").onclick = () => dialog.close();
  dialog.addEventListener("close", () => $("profileButton").focus());
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      dialog.close();
  });
  function show(user) {
    const verified = Boolean(user?.emailVerified);
    $("profileGuest").hidden = verified;
    $("profileMember").hidden = !verified;
    $("profileName").textContent =
      user?.displayName || (verified ? "CityFit member" : "Guest");
    $("profileButton").textContent = verified
      ? user.displayName || "My profile"
      : "Sign in / Profile";
    $("profileInitial").textContent = (user?.displayName || user?.email || "G")
      .slice(0, 1)
      .toUpperCase();
    $("accountEmail").textContent = user?.email || "";
    $("accountProvider").textContent = user?.providerData?.some(
      (p) => p.providerId === "google.com",
    )
      ? "Google"
      : "Email / Password";
    $("profileVerified").textContent = verified ? "Verified" : "Not verified";
    const date = new Date(user?.metadata?.creationTime || "");
    $("profileCreated").textContent = Number.isFinite(date.getTime())
      ? date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "Not available";
    $("profilePhoto").hidden = true;
    $("profilePhoto").removeAttribute("src");
    if (verified && user.photoURL?.startsWith("https://")) {
      $("profilePhoto").src = user.photoURL;
      $("profilePhoto").hidden = false;
    }
    $("profileStatus").textContent = verified
      ? "Signed in"
      : user
        ? "Verify your email, then sign in again."
        : "Browsing as a guest";
  }
  $("profilePhoto").onerror = () => ($("profilePhoto").hidden = true);
  try {
    const client = await getFirebaseClient();
    if (!client) {
      show(null);
      return;
    }
    client.authSDK.onAuthStateChanged(client.auth, show);
    $("signOutAccount").onclick = async () => {
      $("signOutAccount").disabled = true;
      try {
        await client.authSDK.signOut(client.auth);
        show(null);
      } catch {
        $("profileStatus").textContent =
          "Unable to sign out. Please try again.";
      } finally {
        $("signOutAccount").disabled = false;
      }
    };
  } catch {
    show(null);
    $("profileStatus").textContent =
      "Sign-in could not load. Refresh to retry.";
  }
}
