import { getFirebaseClient } from "./firebase-client.js";
export async function initializeAccount() {
  const $ = (id) => document.getElementById(id);
  const dialog = $("profileDialog");
  const avatars = {
    taco: "./assets/truck-taco.png",
    coffee: "./assets/truck-coffee.png",
    sweets: "./assets/truck-sweets.png",
  };
  const avatarNames = {
    default: "Account avatar",
    taco: "Taco trail",
    coffee: "Coffee cruiser",
    sweets: "Sweet wheels",
  };
  let currentUser = null,
    selectedAvatar = "default";
  const avatarKey = () => `cityfit-avatar-v1:${currentUser?.uid || "guest"}`;
  function paintAvatar() {
    const source =
      avatars[selectedAvatar] ||
      (currentUser?.emailVerified &&
      currentUser.photoURL?.startsWith("https://")
        ? currentUser.photoURL
        : null);
    for (const id of ["profilePhoto", "toolbarAvatar"]) {
      $(id).hidden = !source;
      if (source) $(id).src = source;
      else $(id).removeAttribute("src");
    }
    $("profileInitial").hidden = Boolean(source);
    document.querySelectorAll('[name="truckAvatar"]').forEach((input) => {
      input.checked = input.value === selectedAvatar;
    });
  }
  document.querySelectorAll('[name="truckAvatar"]').forEach((input) => {
    input.onchange = () => {
      if (!input.checked) return;
      selectedAvatar = input.value;
      paintAvatar();
      try {
        localStorage.setItem(avatarKey(), selectedAvatar);
        $("avatarStatus").textContent =
          `${avatarNames[selectedAvatar]} selected and saved.`;
      } catch {
        $("avatarStatus").textContent =
          `${avatarNames[selectedAvatar]} selected for now. Browser storage is unavailable.`;
      }
    };
  });
  document.querySelectorAll(".avatar-option img").forEach((image) => {
    image.onerror = () => {
      image.hidden = true;
      const initial = document.createElement("span");
      initial.className = "avatar-default";
      initial.setAttribute("aria-hidden", "true");
      initial.textContent = avatarNames[
        image.closest("label").querySelector("input").value
      ].slice(0, 1);
      image.after(initial);
    };
  });
  $("lightModeToggle").checked =
    document.documentElement.dataset.theme !== "dark";
  $("lightModeToggle").onchange = () => {
    const saved = window.cityfitTheme?.setLight($("lightModeToggle").checked);
    $("themeStatus").hidden = saved === true;
    $("themeStatus").textContent = saved
      ? ""
      : "This setting applies now, but browser storage is unavailable.";
  };
  $("profileButton").onclick = () => {
    dialog.showModal();
    $("profileButton").setAttribute("aria-expanded", "true");
  };
  $("closeProfile").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    $("profileButton").setAttribute("aria-expanded", "false");
    $("profileButton").focus();
  });
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
    currentUser = user;
    selectedAvatar = "default";
    try {
      const saved = localStorage.getItem(avatarKey());
      if (Object.hasOwn(avatars, saved)) selectedAvatar = saved;
    } catch {}
    $("avatarStatus").textContent = "";
    const verified = Boolean(user?.emailVerified);
    $("profileGuest").hidden = verified;
    $("profileMember").hidden = !verified;
    $("profileName").textContent =
      user?.displayName || (verified ? "CityFit member" : "Guest");
    $("profileButtonName").textContent = verified
      ? user.displayName || "My profile"
      : "Sign in / Profile";
    $("profileInitial").textContent = (user?.displayName || user?.email || "G")
      .slice(0, 1)
      .toUpperCase();
    $("avatarDefaultInitial").textContent = $("profileInitial").textContent;
    $("profileButton").setAttribute(
      "aria-label",
      verified
        ? `Open profile for ${user.displayName || "CityFit member"}`
        : "Open guest profile",
    );
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
    paintAvatar();
    $("profileStatus").textContent = verified
      ? "Signed in"
      : user
        ? "Verify your email, then sign in again."
        : "Browsing as a guest";
  }
  for (const id of ["profilePhoto", "toolbarAvatar"])
    $(id).onerror = () => {
      $("profilePhoto").hidden = $("toolbarAvatar").hidden = true;
      $("profileInitial").hidden = false;
      $("avatarStatus").textContent =
        "Avatar image could not load. Your initial is shown instead.";
    };
  show(null);
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
