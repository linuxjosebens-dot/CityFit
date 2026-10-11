import { firebaseConfig } from "./auth-config.js";
let client;
export function getFirebaseClient() {
  if (!client)
    client = (async () => {
      if (
        !firebaseConfig.apiKey ||
        !firebaseConfig.authDomain ||
        !firebaseConfig.projectId ||
        !firebaseConfig.appId
      )
        return null;
      const [appSDK, authSDK] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
      ]);
      const app = appSDK.getApps().length
        ? appSDK.getApp()
        : appSDK.initializeApp(firebaseConfig);
      const auth = authSDK.getAuth(app);
      await auth.authStateReady();
      return { app, auth, authSDK };
    })();
  return client;
}
