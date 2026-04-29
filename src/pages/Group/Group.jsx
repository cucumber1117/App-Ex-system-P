import React, { useState, useEffect } from 'react';
import styles from './Group.module.css';
import { useNavigate } from 'react-router-dom';
import { createGroup, listGroups, getGroupDetails, isMember, joinGroup } from '../../Firebase/auth/groups';
import { auth } from '../../Firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';

const Group = () => {
  const [name, setName] = useState('');
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isJoined, setIsJoined] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    (async () => {
      try {
        setLoading(true);
        await createGroup(name);
        // refresh only if user already searched
        if (hasSearched) {
          const items = await listGroups(search || '');
          setGroups(items);
        }
        setName('');
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      const items = await listGroups(search || '');
      setGroups(items);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = groups; // server returns matching groups

  const handleSelect = async (id) => {
    setSelectedId(id);
    setLoadingDetails(true);
    try {
      const details = await getGroupDetails(id);
      setSelectedDetails(details);
      if (auth && auth.currentUser) {
        const joined = await isMember(id, auth.currentUser.uid);
        setIsJoined(joined);
      } else {
        setIsJoined(false);
      }
    } catch (err) {
      console.error(err);
      setSelectedDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, []);

  const handleJoin = async () => {
    if (!currentUser || !selectedId) return;
    try {
      setLoadingDetails(true);
      await joinGroup(selectedId, currentUser.uid);
      const details = await getGroupDetails(selectedId);
      setSelectedDetails(details);
      setIsJoined(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>グループ作成 / 検索</h1>

      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="グループ名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch() } }}
        />
        <button className={styles.searchBtn} onClick={handleSearch}>🔍</button>
      </div>

      <div className={styles.mainRow}>
        <ul className={styles.list}>
            {loading && <li className={styles.noresult}>読み込み中...</li>}
            {!loading && hasSearched && filtered.map((g) => (
              <li key={g.id} className={`${styles.item} ${selectedId === g.id ? styles.selected : ''}`} onClick={() => handleSelect(g.id)}>{g.name}</li>
            ))}
            {!loading && hasSearched && filtered.length === 0 && <li className={styles.noresult}>該当するグループが見つかりません。</li>}
        </ul>

        <div className={styles.detail}>
          {loadingDetails && <div className={styles.noresult}>詳細を読み込み中...</div>}
          {!loadingDetails && selectedDetails && (
              <div>
                <h2 className={styles.detailTitle}>{selectedDetails.name}</h2>
                <p className={styles.detailItem}>メンバー数: <strong>{selectedDetails.memberCount ?? 0}</strong></p>
                <p className={styles.detailItem}>作成日: {selectedDetails.createdAt?.toDate ? selectedDetails.createdAt.toDate().toLocaleString() : '-'}</p>
                {currentUser ? (
                  isJoined ? (
                    <div className={styles.joinedLabel}>参加済み</div>
                  ) : (
                    <button className={styles.joinBtn} onClick={handleJoin}>参加</button>
                  )
                ) : (
                  <div className={styles.noresult}>ログインすると参加できます</div>
                )}
              </div>
            )}
          {!loadingDetails && !selectedDetails && <div className={styles.noresult}>グループを選択してください。</div>}
        </div>
      </div>

      <div className={styles.createCard}>
        <h2 className={styles.createTitle}>
          + グループ作成
        </h2>

        <p className={styles.createSub}>
          新しいコミュニティを作れます
        </p>

        <form onSubmit={handleSubmit}>
          <input className={styles.createInput} placeholder="グループ名を入力" value={name} onChange={(e)=>setName(e.target.value)} required />

          <button className={styles.createBtn} type="submit">作成する</button>
        </form>
    </div>
    </div>
  );
};

export default Group;
