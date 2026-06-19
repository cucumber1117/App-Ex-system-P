import React, { useCallback, useState, useEffect } from 'react';
import styles from './Group.module.css';
import { createGroup, listGroups, listJoinedGroups, getGroupDetails, isMember, joinGroup, leaveGroup, inviteFriendToGroup, listGroupInvites, acceptGroupInvite, declineGroupInvite, updateGroupName } from '../../Firebase/auth/groups';
import { listFriends } from '../../Firebase/auth/friends';
import { auth } from '../../Firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { Search } from "lucide-react";
import { useTheme } from '../../contexts/ThemeContext';

const Group = () => {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState('');
  const [joinedGroups, setJoinedGroups] = useState([]);
  const [loadingJoinedGroups, setLoadingJoinedGroups] = useState(false);
  const [showJoinedGroups, setShowJoinedGroups] = useState(false);
  const [openedJoinedGroupId, setOpenedJoinedGroupId] = useState(null);
  const [friends, setFriends] = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [openedDescriptionId, setOpenedDescriptionId] = useState(null);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [editingGroupId, setEditingGroupId] = useState('');
  const [editingGroupName, setEditingGroupName] = useState('');
  const [savingGroupName, setSavingGroupName] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    (async () => {
      try {
        setLoading(true);
        const groupId = await createGroup(name, detail, currentUser?.uid);
        for (const friendUid of selectedFriends) {
          await inviteFriendToGroup(
            groupId,
            currentUser.uid,
            friendUid
          );
        }
        setCreatedGroupId(groupId);
        if (currentUser) {
          await refreshJoinedGroups(currentUser.uid);
        }
        // refresh only if user already searched
        if (hasSearched) {
          const items = await listGroups(search || '');
          setGroups(items);
        }
        setName('');
        setDetail('');
        setSelectedFriends([]);
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
        if (joined && details) {
          setJoinedGroups((prev) => (
            prev.some((group) => group.id === details.id) ? prev : [details, ...prev]
          ));
        }
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

  const refreshJoinedGroups = useCallback(async (uid) => {
    if (!uid) {
      setJoinedGroups([]);
      setLoadingJoinedGroups(false);
      return;
    }

    try {
      setLoadingJoinedGroups(true);
      const items = await listJoinedGroups(uid);
      setJoinedGroups(items);
    } catch (err) {
      console.error(err);
      setJoinedGroups([]);
    } finally {
      setLoadingJoinedGroups(false);
    }
  }, []);

  const refreshGroupData = useCallback(async (uid) => {
    if (!uid) {
      setFriends([]);
      setGroupInvites([]);
      return;
    }

    try {
      const [friendItems, inviteItems] = await Promise.all([
        listFriends(uid),
        listGroupInvites(uid),
      ]);
      setFriends(friendItems);
      setGroupInvites(inviteItems);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
      refreshJoinedGroups(u?.uid);
      refreshGroupData(u?.uid);
    });
    return () => unsub();
  }, [refreshGroupData, refreshJoinedGroups]);

  const handleJoin = async () => {
    if (!currentUser || !selectedId) return;
    try {
      setLoadingDetails(true);
      await joinGroup(selectedId, currentUser.uid);
      const details = await getGroupDetails(selectedId);
      setSelectedDetails(details);
      setIsJoined(true);
      await refreshJoinedGroups(currentUser.uid);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleLeave = async (groupId = selectedId) => {
    if (!currentUser || !groupId) return;
    try {
      setLoadingDetails(true);
      await leaveGroup(groupId, currentUser.uid);
      const details = await getGroupDetails(groupId);
      if (selectedId === groupId) {
        setSelectedDetails(details);
        setIsJoined(false);
      }
      setJoinedGroups((prev) => prev.filter((group) => group.id !== groupId));
      setGroups((prev) => prev.map((group) => (group.id === groupId && details ? details : group)));
      await refreshJoinedGroups(currentUser.uid);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const startEditingGroupName = (group, e) => {
    e.stopPropagation();
    setEditingGroupId(group.id);
    setEditingGroupName(group.name || '');
    setInviteError('');
    setInviteMessage('');
  };

  const cancelEditingGroupName = (e) => {
    e.stopPropagation();
    setEditingGroupId('');
    setEditingGroupName('');
  };

  const handleUpdateGroupName = async (e, groupId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser || !groupId) return;

    try {
      setSavingGroupName(true);
      setInviteError('');
      setInviteMessage('');
      const nextName = await updateGroupName(groupId, currentUser.uid, editingGroupName);
      const applyName = (group) => (
        group.id === groupId ? { ...group, name: nextName } : group
      );

      setJoinedGroups((prev) => prev.map(applyName));
      setGroups((prev) => prev.map(applyName));
      setGroupInvites((prev) => prev.map((invite) => (
        invite.group?.id === groupId
          ? { ...invite, group: { ...invite.group, name: nextName } }
          : invite
      )));

      if (selectedDetails?.id === groupId) {
        setSelectedDetails((prev) => prev ? { ...prev, name: nextName } : prev);
      }

      setEditingGroupId('');
      setEditingGroupName('');
      setInviteMessage('グループ名を変更しました');
    } catch (err) {
      console.error(err);
      setInviteError(err.message || 'グループ名を変更できませんでした');
    } finally {
      setSavingGroupName(false);
    }
  };

  const handleInvite = async (e, groupId) => {
    e.preventDefault();
    if (!currentUser || !groupId || !inviteFriendId) return;

    try {
      setInviteError('');
      setInviteMessage('');
      await inviteFriendToGroup(groupId, currentUser.uid, inviteFriendId);
      setInviteFriendId('');
    } catch (err) {
      console.error(err);
      setInviteError(err.message || '招待を送れませんでした');
    }
  };

  const handleAcceptInvite = async (invite) => {
    if (!currentUser) return;
    try {
      await acceptGroupInvite(invite.groupId, currentUser.uid);
      await Promise.all([
        refreshJoinedGroups(currentUser.uid),
        refreshGroupData(currentUser.uid),
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineInvite = async (invite) => {
    if (!currentUser) return;
    try {
      await declineGroupInvite(invite.groupId, currentUser.uid);
      await refreshGroupData(currentUser.uid);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={`${styles.container} ${styles[theme]}`}>
      <h1 className={styles.title}>グループ作成 / 検索</h1>

      {currentUser && groupInvites.length > 0 && (
        <section className={styles.invites}>
          <h2 className={styles.sectionTitle}>受け取った招待</h2>
          <ul className={styles.inviteList}>
            {groupInvites.map((invite) => (
              <li key={invite.id} className={styles.inviteItem}>
                <div>
                  <strong>{invite.group.name}</strong>
                  <span className={styles.groupId}>ID: {invite.group.id}</span>
                </div>
                <div className={styles.inviteActions}>
                  <button className={styles.acceptBtn} onClick={() => handleAcceptInvite(invite)}>参加</button>
                  <button className={styles.declineBtn} onClick={() => handleDeclineInvite(invite)}>辞退</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

     <section className={styles.joinedGroups}>
     <div className={styles.joinedHeader}>
     <h2 className={styles.sectionTitle}>
       参加中のグループ
    </h2>

    <button
      className={styles.toggleBtn}
      onClick={() => setShowJoinedGroups(!showJoinedGroups)}
    >
      {showJoinedGroups ? '閉じる' : '表示'}
    </button>
  </div>

  {showJoinedGroups && (
    <>
      {!currentUser && (
        <p className={styles.noresult}>
          ログインすると参加中のグループを確認できます。
        </p>
      )}

      {currentUser && loadingJoinedGroups && (
        <p className={styles.noresult}>
          読み込み中...
        </p>
      )}

      {currentUser &&
        !loadingJoinedGroups &&
        joinedGroups.length === 0 && (
          <p className={styles.noresult}>
            参加中のグループはありません。
          </p>
        )}

      {currentUser &&
        !loadingJoinedGroups &&
        joinedGroups.length > 0 && (
          <ul className={styles.joinedList}>
            {joinedGroups.map((g) => (
              <li
                key={g.id}
                className={styles.joinedItem}
                onClick={() => setOpenedJoinedGroupId(openedJoinedGroupId === g.id ? null : g.id)}
              >
                {editingGroupId === g.id ? (
                  <form
                    className={styles.renameForm}
                    onSubmit={(e) => handleUpdateGroupName(e, g.id)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      className={styles.renameInput}
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      autoFocus
                      required
                    />
                    <button className={styles.renameSaveBtn} type="submit" disabled={savingGroupName}>
                      {savingGroupName ? '保存中' : '保存'}
                    </button>
                    <button className={styles.renameCancelBtn} type="button" onClick={cancelEditingGroupName}>
                      やめる
                    </button>
                  </form>
                ) : (
                  <span className={styles.groupName}>
                    {g.name}
                  </span>
                )}

                <span className={styles.groupId}>
                  ID: {g.groupId || g.id}
                </span>

                {openedJoinedGroupId === g.id && (
                  <div className = {styles.joinedDetail}>

                    <p className = {styles.detailItem}>
                      メンバー数:
                      <strong>{g.memberCount ?? 0}</strong>
                    </p>

                    
                    <div className={styles.detailItem}>
                      <div className = {styles.descriptionRow}>
                        <span className={styles.descriptionLabel}>説明</span>

                        <button className={styles.showDesBtn} onClick={(e) => {
                          e.stopPropagation();
                          setOpenedDescriptionId(
                            openedDescriptionId === g.id ? null : g.id
                          );
                        }}
                        >
                          {openedDescriptionId === g.id ? "非表示" : "表示"}
                        </button>
                    </div>
                    {openedDescriptionId === g.id && (
                      <p className= {styles.descriptionText}>
                        {g.detail || "説明はありません"}
                      </p>
                    )}
                    </div>

                    <div className={styles.joinedActions}>
                      <div className={styles.joinedLabel}>
                        参加済み
                      </div>

                      <button className={styles.renameBtn} onClick={(e) => startEditingGroupName(g, e)}>
                        名前変更
                      </button>

                      <button className={styles.leaveBtn} onClick={(e) => {e.stopPropagation(); handleLeave(g.id)}}>
                        脱退
                      </button>
                    </div>

                    <form className = {styles.inviteForm} onSubmit = {(e) => handleInvite(e, g.id)} onClick = {(e) => e.stopPropagation()}>
                      <select className= {styles.inviteSelect} value={inviteFriendId} onChange={(e) => setInviteFriendId(e.target.value)} required>
                        <option value="">フレンドを選択</option>

                        {friends.map((friend) => (
                          <option key = {friend.id} value = {friend.id}>
                            {friend.name || friend.email || friend.id}
                          </option>
                        ))}
                      </select>

                      <button className={styles.inviteBtn} type="submit" disabled={friends.length === 0}>
                        招待
                      </button>
                    </form>

                    {friends.length === 0 && (
                      <p className={styles.noresult}>
                        招待できるフレンドがいません。
                      </p>
                    )}

                    {inviteError && (
                      <p className={styles.errorText}>
                        {inviteError}
                      </p>
                    )}
                    
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </>
  )}
</section>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="グループIDで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch() } }}
        />
        <button className={styles.searchBtn} onClick={handleSearch}>
          <Search size={20}/>
        </button>
      </div>

      <div className={styles.mainRow}>
        <ul className={styles.list}>
            {loading && <li className={styles.noresult}>読み込み中...</li>}
            {!loading && hasSearched && filtered.map((g) => (
              <li key={g.id} className={`${styles.item} ${selectedId === g.id ? styles.selected : ''}`} onClick={() => handleSelect(g.id)}>
                <span className={styles.groupName}>{g.name}</span>
                <span className={styles.groupId}>ID: {g.groupId || g.id}</span>
              </li>
            ))}
            {!loading && hasSearched && filtered.length === 0 && <li className={styles.noresult}>該当するグループが見つかりません。</li>}
        </ul>

        <div className={styles.detail}>
          {loadingDetails && <div className={styles.noresult}>詳細を読み込み中...</div>}
          {!loadingDetails && selectedDetails && (
              <div>
                <h2 className={styles.detailTitle}>{selectedDetails.name}</h2>
                {editingGroupId === selectedDetails.id && (
                  <form
                    className={styles.renameForm}
                    onSubmit={(e) => handleUpdateGroupName(e, selectedDetails.id)}
                  >
                    <input
                      className={styles.renameInput}
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      autoFocus
                      required
                    />
                    <button className={styles.renameSaveBtn} type="submit" disabled={savingGroupName}>
                      {savingGroupName ? '保存中' : '保存'}
                    </button>
                    <button className={styles.renameCancelBtn} type="button" onClick={cancelEditingGroupName}>
                      やめる
                    </button>
                  </form>
                )}
                <p className={styles.detailItem}>グループID: <strong>{selectedDetails.groupId || selectedDetails.id}</strong></p>
                <p className={styles.detailItem}>メンバー数: <strong>{selectedDetails.memberCount ?? 0}</strong></p>
                <p className={styles.detailItem}>説明:<strong>{selectedDetails.detail || "説明はありません"}</strong></p>
                <p className={styles.detailItem}>作成日: {selectedDetails.createdAt?.toDate ? selectedDetails.createdAt.toDate().toLocaleString() : '-'}</p>
                {currentUser ? (
                  isJoined ? (
                    <>
                      <div className={styles.joinedActions}>
                        <div className={styles.joinedLabel}>参加済み</div>
                        <button className={styles.renameBtn} onClick={(e) => startEditingGroupName(selectedDetails, e)}>名前変更</button>
                        <button className={styles.leaveBtn} onClick={() => handleLeave(selectedDetails.id)}>脱退</button>
                      </div>
                      <form className={styles.inviteForm} onSubmit={(e) => handleInvite(e, selectedDetails.id)}>
                        <select
                          className={styles.inviteSelect}
                          value={inviteFriendId}
                          onChange={(e) => setInviteFriendId(e.target.value)}
                          required
                        >
                          <option value="">フレンドを選択</option>
                          {friends.map((friend) => (
                            <option key={friend.id} value={friend.id}>
                              {friend.name || friend.email || friend.id}
                            </option>
                          ))}
                        </select>
                        <button className={styles.inviteBtn} type="submit" disabled={friends.length === 0}>
                          招待
                        </button>
                      </form>
                      {friends.length === 0 && <p className={styles.noresult}>招待できるフレンドがいません。</p>}
                      {inviteMessage && <p className={styles.successText}>{inviteMessage}</p>}
                      {inviteError && <p className={styles.errorText}>{inviteError}</p>}
                    </>
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

          <textarea className={styles.createInput} placeholder="グループの説明を入力" value={detail} onChange={(e) => setDetail(e.target.value)}/>
          
          <div className={styles.friendSelectArea}>
            <p>フレンドを招待</p>

            <div className={styles.selectedFriends}>
              {selectedFriends.length === 0 && (
                <span className={styles.placeholderText}>
                  フレンドを選択
                </span>
              )}
              
              {selectedFriends.map((friendId) => {
                const friend = friends.find((f) => f.id === friendId);

                return (
                  <span key = {friendId} className={styles.selectedFriend}>
                    {friend?.name || friend?.email || friendId}

                    <button type = "button" onClick={() => setSelectedFriends((prev) => prev.filter((id) => id !== friendId))}>
                      ×
                    </button>
                  </span>
                );
              })}
            </div>

            <div className={styles.friendList}>
              {friends.length === 0 ? (
                <p>フレンドがいません</p>
              ) : (
                friends.map((friend) => (
                  <div key={friend.id} className={styles.friendItem} onClick={() => {
                    if (!selectedFriends.includes(friend.id)) {
                      setSelectedFriends((prev) => [
                        ...prev,
                        friend.id,
                      ]);
                    }
                  }}
                >
                  {friend.name || friend.email || friend.id}
                </div>
                ))
              )}
            </div>
          </div>

          <button className={styles.createBtn} type="submit">作成する</button>
          {createdGroupId && (
            <p className={styles.createdId}>作成したグループID: <strong>{createdGroupId}</strong></p>
          )}
        </form>
    </div>
    </div>
  );
};

export default Group;
