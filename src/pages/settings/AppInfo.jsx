import React from 'react';
import { ArrowLeft, Mail, Sparkles, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './AppInfo.module.css';

const features = [
  '予定を月・週・日表示で確認',
  'フレンドやグループへの予定共有',
  '通知とリマインダー設定',
  'テーマや表示方法のカスタマイズ',
];

const AppInfo = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();

  return (
    <main className={`${styles.container} ${styles[theme]}`}>
      <header className={styles.header}>
        <button
          className={styles.backButton}
          type="button"
          onClick={() => navigate('/settings')}
          aria-label="設定に戻る"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div>
          <p className={styles.kicker}>App Information</p>
          <h1 className={styles.title}>アプリ情報</h1>
        </div>
      </header>

      <section className={styles.heroSection}>
        <div className={styles.appIcon} aria-hidden="true">
          <Sparkles size={28} />
        </div>
        <div>
          <h2 className={styles.appName}>スケジュール管理アプリ</h2>
          <p className={styles.description}>
            日々の予定を見やすく整理し、フレンドやグループとスムーズに共有できるカレンダーアプリです。
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>開発者</h2>
        <div className={styles.developerRow}>
          <div className={styles.developerIcon} aria-hidden="true">
            <UsersRound size={22} />
          </div>
          <div>
            <div className={styles.label}>グループ２</div>
            <p className={styles.muted}>シンプルで使いやすい予定管理体験を目指して開発しています。</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>アプリの説明</h2>
        <p className={styles.bodyText}>
          個人の予定管理に加えて、友だちやグループとの予定共有をまとめて扱えるアプリです。
          表示設定や通知設定を自分に合わせて変更できます。
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>主要機能</h2>
        <ul className={styles.featureList}>
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>お問い合わせ</h2>
        <a className={styles.contactLink} href="mailto:support@example.com">
          <Mail size={18} aria-hidden="true" />
          support@example.com
        </a>
      </section>
    </main>
  );
};

export default AppInfo;
