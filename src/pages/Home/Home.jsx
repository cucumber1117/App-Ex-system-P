import React from 'react';
import { useNavigate } from 'react-router-dom';
import './home.module.css';

export default function Home() {
	const navigate = useNavigate();

	return (
		<div style={{padding:20}}>
			<h1>ホーム</h1>
		</div>
	);
}
