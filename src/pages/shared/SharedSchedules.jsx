import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SharedSchedules() {
  const navigate = useNavigate();



  return (
    <div style={{padding:20}}>
      <h2>共有中のスケジュール</h2>
      <ul>
        {example.map(s => (
          <li key={s.id}>{s.title} — 共有者: {s.owner}</li>
        ))}
      </ul>
      <button onClick={() => navigate(-1)}>戻る</button>
    </div>
  );
}
