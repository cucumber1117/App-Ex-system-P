import React from 'react';
import { ArrowLeft, Bell, CalendarDays, Mail, Palette, Share2, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './AppInfo.module.css';

const features = [
  { icon: CalendarDays, label: '予定を見やすく管理' },
  { icon: UsersRound, label: 'フレンドと予定を共有' },
  { icon: Share2, label: 'グループ予定をまとめて共有' },
  { icon: Bell, label: '通知と表示を自分向けに調整' },
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
          <p className={styles.kicker}>アプリについて</p>
          <h1 className={styles.title}>アプリ情報</h1>
        </div>
      </header>

      <section className={styles.heroSection}>
        <img className={styles.appIcon} src="/app-icon-512.png" alt="" aria-hidden="true" />
        <div>
          <h2 className={styles.appName}>スケジュール管理アプリ</h2>
          <p className={styles.description}>
            個人の予定管理から、フレンド・グループとの予定共有までまとめて扱えるカレンダーアプリです。
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
          予定を確認しやすく整理し、共有したい相手に予定を届けられます。
          通知や表示も自分に合わせて調整できます。
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>主要機能</h2>
        <ul className={styles.featureList}>
          {features.map((feature) => (
            <li key={feature.label}>
              <span className={styles.featureIcon} aria-hidden="true">
                {React.createElement(feature.icon, { size: 18 })}
              </span>
              <span>{feature.label}</span>
            </li>
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
