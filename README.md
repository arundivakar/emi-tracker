# 💰 EMI Tracker

A premium, offline-first EMI & loan tracking application built with **React**, **Capacitor**, and **SQLite**.

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Capacitor](https://img.shields.io/badge/Capacitor-6-119EFF?logo=capacitor)](https://capacitorjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## ✨ Features

- 📊 **Loan Management** — Track personal loans, home loans, car loans, credit card EMIs
- 👥 **Multi-Person Profiles** — Assign loans to family members or track for different people
- 📅 **Amortization Schedule** — Auto-generated EMI schedule with interest/principal breakdowns
- 💳 **Payment Tracking** — Mark EMIs as Paid, Partial, Skipped, or Overdue
- 📈 **Dashboard Analytics** — Visual portfolio overview with charts and metrics
- 📄 **PDF Export** — Export repayment schedule as shareable PDF
- 💾 **Local Backup & Restore** — Export/import complete database as SQLite file
- 🔔 **Notifications** — EMI due date reminders via local notifications
- 🌙 **Dark/Light Mode** — System-adaptive theme
- 📱 **Offline First** — All data stored locally using SQLite WASM

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript |
| Styling | Vanilla CSS (custom design system) |
| Database | SQLite WASM (sql.js / @sqlite.org/sqlite-wasm) |
| Mobile | Capacitor 6 (Android) |
| Build | Vite |
| PDF Export | jsPDF + jsPDF-AutoTable |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Android Studio (for Android builds)
- Java 21+ (for Gradle)

### Web Development
```bash
npm install
npm run dev
```

### Android Build
```bash
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`

## 📸 Screenshots

*Coming soon*

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 👤 Developer

**Arun Divakar** — [@arundivakar](https://github.com/arundivakar)
