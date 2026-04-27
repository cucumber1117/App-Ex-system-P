import React from 'react';
import styles from './Footer.module.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../Firebase/firebaseConfig';
import { signOut } from 'firebase/auth';

const Footer = () => {
	const navigate = useNavigate();
	const location = useLocation();

	const handleLogout = async () => {
		try {
			await signOut(auth);
			navigate('/');
		} catch (err) {
			console.error('サインアウトエラー:', err);
		}
	};

	return (
		<nav className={styles.footer}>
			<button
				className={`${styles.item} ${location.pathname === '/' ? styles.active : ''}`}
				onClick={() => navigate('/')}
				aria-label="ホーム"
			>
				<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
				<span className={styles.label}>ホーム</span>
			</button>

			<button
				className={`${styles.item} ${location.pathname === '/create' ? styles.active : ''}`}
				onClick={() => navigate('/create')}
				aria-label="ルーム作成"
			>
				<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
				<span className={styles.label}>グループ</span>
			</button>

			<button
				className={styles.item}
				onClick={handleLogout}
				aria-label="ログアウト"
			>
				<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
					<path d="M13 19H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
				<span className={styles.label}>設定</span>
			</button>
		</nav>
	);
};

export default Footer;

