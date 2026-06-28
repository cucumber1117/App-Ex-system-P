import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import packageInfo from '../../../package.json';
import styles from './AppInfo.module.css';

const features = [
  '年・月・週・日表示のカレンダー',
  '予定の作成・編集・削除',
  'カテゴリと繰り返し予定の管理',
  'フレンド招待・管理',
  'グループ予定の共有',
  '通知・表示設定のカスタマイズ',
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
          <span>戻る</span>
        </button>
        <h1 className={styles.title}>アプリ情報</h1>
      </header>

      <div className={styles.detailPanel}>
        <section className={styles.detailSection}>
          <h2>アプリ名</h2>
          <p>スケジュール管理アプリ</p>
        </section>

        <section className={styles.detailSection}>
          <h2>バージョン</h2>
          <p>{packageInfo.version}</p>
        </section>

        <section className={styles.detailSection}>
          <h2>開発者</h2>
          <p>グループ２</p>
        </section>

        <section className={styles.detailSection}>
          <h2>アプリの説明</h2>
          <p>
            個人の予定を見やすく整理し、友達やグループと予定を共有できるカレンダーアプリです。
            予定のカテゴリ分けや繰り返し設定、通知設定を使って、自分に合ったスケジュール管理ができます。
          </p>
        </section>

        <section className={styles.detailSection}>
          <h2>主な機能</h2>
          <ul className={styles.featureList}>
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>

        <section className={styles.detailSection}>
          <h2>法的情報</h2>
          <a className={styles.legalLink} href="mailto:support@example.com">
            利用規約・プライバシーポリシー
          </a>
        </section>

        <section className={styles.detailSection}>
          <h2>お問い合わせ</h2>
          <p>
            ご質問やお困りのことがございましたら、以下までお気軽にお問い合わせください。
          </p>
          <a className={styles.contactLink} href="mailto:support@example.com">
            support@example.com
          </a>
        </section>
      </div>
    </main>
  );
};

export default AppInfo;
