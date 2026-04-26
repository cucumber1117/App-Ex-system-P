import { auth, db } from "../firebaseConfig"; // Firestoreを使うためにdbをインポート
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export async function signUpWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);

        const user = result.user;


        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            createdAt: new Date(),
        });

        console.log("Googleサインアップ成功 & Firestoreにユーザー情報を保存:", user);

        return user;
    } catch (error) {
        console.error("Googleサインアップエラー:", error.code, error.message);
        throw error;
    }
}