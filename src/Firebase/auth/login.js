import { auth } from "../firebaseConfig"; 
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);


    const user = result.user;
    console.log("Googleログイン成功:", user);

    return user;
  } catch (error) {
    console.error("Googleログインエラー:", error.code, error.message);
    throw error;
  }
}