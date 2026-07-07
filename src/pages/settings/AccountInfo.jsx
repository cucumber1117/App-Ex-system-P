import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import AccountProfile from '../../compornent/AccountProfile/AccountProfile';
import { auth } from '../../Firebase/firebaseConfig';
import { getUserProfile, updateUserProfile } from '../../Firebase/auth/users';

const AccountInfo = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (!user) {
        setProfile(null);
        return;
      }

      try {
        const savedProfile = await getUserProfile(user.uid);
        setProfile({
          uid: user.uid,
          name: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
          metadata: user.metadata,
          ...savedProfile,
        });
      } catch (err) {
        console.error(err);
        setProfile({
          uid: user.uid,
          name: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
          metadata: user.metadata,
        });
      }
    });

    return () => unsub();
  }, []);

  const handleSave = async ({ name, status }) => {
    if (!currentUser) throw new Error('ログインが必要です');

    setSaving(true);

    try {
      const savedProfile = await updateUserProfile(currentUser, { name, status });
      setProfile((prev) => ({
        ...prev,
        ...savedProfile,
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/settings');
  };

  if (!currentUser) {
    return (
      <AccountProfile
        profile={{ name: '未ログイン', uid: '未登録', status: 'ログインしていません' }}
        onBack={() => navigate('/settings')}
      />
    );
  }

  return (
    <AccountProfile
      profile={profile || currentUser}
      editable
      saving={saving}
      onBack={() => navigate('/settings')}
      onSave={handleSave}
      onLogout={handleLogout}
    />
  );
};

export default AccountInfo;
