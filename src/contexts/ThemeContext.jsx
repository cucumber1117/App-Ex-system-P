import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../Firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserSettings, setUserSettings } from '../Firebase/auth/users';

const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState('light');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setCurrentUser(u);
      if (u) {
        try {
          const s = await getUserSettings(u.uid);
          const t = s.theme || JSON.parse(localStorage.getItem('settings') || '{}').theme || 'light';
          setThemeState(t);
        } catch (err) {
          console.error('load settings', err);
        }
      } else {
        const raw = localStorage.getItem('settings');
        const parsed = raw ? JSON.parse(raw) : {};
        setThemeState(parsed.theme || 'light');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('light', 'dark', 'green');
      document.documentElement.classList.add(theme || 'light');
    }
  }, [theme]);

  const setTheme = async (newTheme) => {
    setThemeState(newTheme);
    // persist
    if (currentUser) {
      try {
        await setUserSettings(currentUser.uid, { theme: newTheme });
      } catch (err) {
        console.error('save theme', err);
      }
    } else {
      const raw = localStorage.getItem('settings');
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.theme = newTheme;
      localStorage.setItem('settings', JSON.stringify(parsed));
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
