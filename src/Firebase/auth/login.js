import { auth } from "../firebaseConfig"; 
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { saveUserProfile } from "./users";

export async function loginWithGoogle(options = {}) {
  try {
    const provider = new GoogleAuthProvider();

    if (options.selectAccount) {
      provider.setCustomParameters({
        prompt: "select_account",
      });
    }

    const result = await signInWithPopup(auth, provider);


    const user = result.user;
    await saveUserProfile(user);
    console.log("Googleログイン成功:", user);

    return user;
  } catch (error) {
    console.error("Googleログインエラー:", error.code, error.message);
    throw error;
  }
}
