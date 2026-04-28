import React from "react";
import CalendarPage from "./CalendarPage.jsx";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <div className={styles.home}>
      <CalendarPage />
    </div>
  );
}