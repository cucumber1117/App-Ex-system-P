import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function CreateSchedule() {
  const navigate = useNavigate();

  return (
    <div style={{padding:20}}>
      <h2>スケジュール作成</h2>
      <p>ここにスケジュール作成フォームを実装</p>
      <button onClick={() => navigate(-1)}>戻る</button>
    </div>
  );
}
