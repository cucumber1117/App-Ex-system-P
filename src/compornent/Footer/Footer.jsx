import React from 'react';
import styles from './Footer.module.css';
import { useNavigate, useLocation } from 'react-router-dom';

const Footer = () => {
	const navigate = useNavigate();
	const location = useLocation();

	const handleSettings = () => {
		navigate('/settings');
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
				className={`${styles.item} ${location.pathname === '/friends' ? styles.active : ''}`}
				onClick={() => navigate('/friends')}
				aria-label="フレンド"
			>
				<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
				<span className={styles.label}>フレンド</span>
			</button>

			<button
				className={`${styles.item} ${location.pathname === '/settings' ? styles.active : ''}`}
				onClick={handleSettings}
				aria-label="設定"
			>
				<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" fill="currentColor"/>
					<path d="M19.43 12.98c.04-.32.07-.66.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.6-.22l-2.49 1a7.12 7.12 0 00-1.7-.98l-.38-2.65A.5.5 0 0014.5 2h-5a.5.5 0 00-.5.42l-.38 2.65c-.6.24-1.16.56-1.7.98l-2.49-1a.5.5 0 00-.6.22l-2 3.46a.5.5 0 00.12.64L4.57 11c-.04.32-.07.66-.07.98s.03.66.07.98L2.46 14.6a.5.5 0 00-.12.64l2 3.46c.14.24.44.34.7.22l2.49-1c.54.42 1.1.74 1.7.98l.38 2.65c.07.28.31.48.59.48h5c.28 0 .52-.2.59-.48l.38-2.65c.6-.24 1.16-.56 1.7-.98l2.49 1c.26.12.56.02.7-.22l2-3.46a.5.5 0 00-.12-.64L19.43 12.98z" fill="currentColor"/>
				</svg>
				<span className={styles.label}>設定</span>
			</button>
		</nav>
	);
};

export default Footer;
