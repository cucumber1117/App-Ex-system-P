import { Routes, Route } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import Home from './pages/home/home.jsx';
import Group from './pages/Group/Group.jsx';
import SharedSchedules from './pages/shared/SharedSchedules.jsx';
import Settings from './pages/settings/Settings.jsx';
import Footer from './compornent/Footer/Footer.jsx';
import { loginWithGoogle } from './Firebase/auth/login';
import { auth } from './Firebase/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import './theme.css';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  const [user, setUser] = useState(null);

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
    <ThemeProvider>
      <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<Group />} />
        <Route path="/shared" element={<SharedSchedules />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <Footer />
      </>
    </ThemeProvider>
  );
}

export default App;