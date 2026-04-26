import React from 'react';
import { useNavigate } from 'react-router-dom';
import './home.module.css';

export default function Home() {
	const navigate = useNavigate();

	return (
		<div style={{padding:20}}>
			<h1>ホーム</h1>
			<div style={{display:'flex',gap:12}}>
				<button onClick={() => navigate('/create')}>新しいスケジュール作成</button>
				<button onClick={() => navigate('/shared')}>共有中のスケジュールを見る</button>
			</div>
		</div>
	);
}
