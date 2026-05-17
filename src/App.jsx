import { Routes, Route } from 'react-router-dom';
import React, { useEffect } from 'react';
import Home from './pages/Home/Home.jsx';
import Group from './pages/Group/Group.jsx';
import Friends from './pages/Friends/Friends.jsx';
import SharedSchedules from './pages/shared/SharedSchedules.jsx';
import Settings from './pages/settings/Settings.jsx';
import Footer from './compornent/Footer/Footer.jsx';
import './theme.css';
import { ThemeProvider } from './contexts/ThemeContext';

const NotificationWatcher = () => {
  useEffect(() => {
    const notifiedIds = new Set();

    const showNotification = (title, body) => {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      new Notification(title, {
        body,
        icon: '/vite.svg',
      });
    };

    const checkSchedules = () => {
      const settingsRaw = localStorage.getItem('settings');
      const schedulesRaw = localStorage.getItem('schedules');

      if (!settingsRaw || !schedulesRaw) return;

      let settings;
      let schedules;

      try {
        settings = JSON.parse(settingsRaw);
        schedules = JSON.parse(schedulesRaw);
      } catch (err) {
        console.error(err);
        return;
      }

      if (!settings.notifications) return;
      if (!Array.isArray(schedules)) return;

      const reminderMinutes = Number(settings.reminderTime || 10);
      const now = new Date();

      schedules.forEach((schedule) => {
        if (!schedule.date || !schedule.time) return;

        const scheduleDate = new Date(`${schedule.date}T${schedule.time}`);
        const notifyTime = new Date(
          scheduleDate.getTime() - reminderMinutes * 60 * 1000
        );

        const diff = notifyTime.getTime() - now.getTime();

        if (diff <= 0 && diff > -60 * 1000) {
          const notifyKey = `${schedule.id || schedule.title}-${reminderMinutes}`;

          if (notifiedIds.has(notifyKey)) return;

          showNotification(
            '予定のリマインダー',
            `${schedule.title || '予定'} が${reminderMinutes}分後に始まります`
          );

          notifiedIds.add(notifyKey);
        }
      });
    };

    const timer = setInterval(checkSchedules, 30 * 1000);
    checkSchedules();

    return () => clearInterval(timer);
  }, []);

  return null;
};

function App() {
  return (
    <ThemeProvider>
      <>
        <NotificationWatcher />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Group />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/shared" element={<SharedSchedules />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>

        <Footer />
      </>
    </ThemeProvider>
  );
}

export default App;
