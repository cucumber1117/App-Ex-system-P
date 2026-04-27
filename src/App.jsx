import { Routes, Route } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import Home from './pages/home/home.jsx';
import CreateSchedule from './pages/create/CreateSchedule.jsx';
import SharedSchedules from './pages/shared/SharedSchedules.jsx';
import { loginWithGoogle } from './Firebase/auth/login';
import { auth } from './Firebase/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <header style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #e6e6e6'}}>
        <div style={{fontWeight: 700}}>システム</div>
        <div>
          {user ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'user'}
              title="サインアウト"
              onClick={handleSignOut}
              style={{width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', objectFit: 'cover'}}
            />
          ) : (
            <button onClick={handleLogin}>ログイン</button>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateSchedule />} />
        <Route path="/shared" element={<SharedSchedules />} />
      </Routes>
    </>
  );
}

export default App;