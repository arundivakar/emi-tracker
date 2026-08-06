import React, { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { Download, Upload, ShieldAlert, GitBranch, Code2, ExternalLink, Info } from 'lucide-react';

export const BackupSettings: React.FC = () => {
  const { triggerRefresh } = useDatabase();
  const importInputRef = useRef<HTMLInputElement>(null);

  // Helper: convert Uint8Array to base64
  const uint8ToBase64 = (u8: Uint8Array): string => {
    let binary = '';
    const len = u8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(u8[i]);
    }
    return btoa(binary);
  };

  const handleLocalExport = async () => {
    try {
      const binary = dbManager.exportDatabaseBinary() as Uint8Array;
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `emi_tracker_${dateStr}.sqlite`;

      if (Capacitor.isNativePlatform()) {
        // Android / iOS: write to Documents, then share
        const base64Data = uint8ToBase64(binary);
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
        });

        const fileUri = await Filesystem.getUri({
          directory: Directory.Documents,
          path: fileName,
        });

        await Share.share({
          title: 'EMI Tracker Backup',
          text: `Your EMI Tracker backup (${dateStr})`,
          url: fileUri.uri,
          dialogTitle: 'Save or Share Backup',
        });
      } else {
        // Web browser: standard blob download
        const blob = new Blob([binary.buffer as ArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      alert('Export failed. See console for details.');
      console.error(e);
    }
  };

  const handleLocalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer;
          const u8array = new Uint8Array(buffer);
          if (window.confirm('WARNING: Importing this file will overwrite all your current data! Do you want to proceed?')) {
            await dbManager.importDatabaseBinary(u8array);
            alert('Database successfully restored from backup!');
            triggerRefresh();
          }
        } catch (err) {
          console.error(err);
          alert('Failed to parse backup file. Make sure it is a valid SQLite file.');
        }
      };
      reader.readAsArrayBuffer(file);
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  const handlePickFile = () => {
    importInputRef.current?.click();
  };

  return (
    <div className="animate-fade" style={{ padding: '0.5rem 1rem 5rem', maxWidth: 560, margin: '0 auto' }}>

      {/* Local Backup Card */}
      <div className="settings-section-card">
        <div className="settings-section-header">
          <div className="settings-section-icon" style={{ background: 'rgba(79, 70, 229, 0.08)', color: '#4F46E5' }}>
            <Download size={18} />
          </div>
          <div>
            <div className="settings-section-title">Local Backup</div>
            <div className="settings-section-sub">Export & restore your complete data</div>
          </div>
        </div>

        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          Download your EMIs, profiles, and payment history as a portable SQLite file. You can restore it on any device running EMI Tracker.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleLocalExport} style={{ flex: 1, minWidth: 140 }}>
            <Download size={15} /> Export Database
          </button>
          <button className="btn btn-outline" onClick={handlePickFile} style={{ flex: 1, minWidth: 140 }}>
            <Upload size={15} /> Restore Backup
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".sqlite,.db,.sqlite3"
            onChange={handleLocalImport}
            style={{ display: 'none' }}
          />
        </div>

        <div className="settings-info-banner">
          <ShieldAlert size={16} style={{ color: 'var(--status-partial)', flexShrink: 0, marginTop: 1 }} />
          <span>Keep your backup file safe — it includes all loans, schedules, remarks, and person profiles.</span>
        </div>
      </div>

      {/* About Section */}
      <div className="settings-section-card" style={{ marginTop: '1rem' }}>
        <div className="settings-section-header">
          <div className="settings-section-icon" style={{ background: 'rgba(79, 70, 229, 0.06)', color: 'var(--primary)' }}>
            <Info size={18} />
          </div>
          <div>
            <div className="settings-section-title">About EMI Tracker</div>
            <div className="settings-section-sub">Version 1.0.0 · Open Source</div>
          </div>
        </div>

        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          A premium offline-first EMI and loan tracking application. Built with React, Capacitor, and SQLite — all your data stays on your device.
        </p>

        <div className="settings-about-links">
          <a
            href="https://github.com/arundivakar/emi-tracker"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-link-row"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <GitBranch size={17} />
              <span>View Source on GitHub</span>
            </div>
            <ExternalLink size={14} style={{ color: 'var(--text-muted)' }} />
          </a>
          <a
            href="https://github.com/arundivakar"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-link-row"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Code2 size={17} />
              <span>Developer — @arundivakar</span>
            </div>
            <ExternalLink size={14} style={{ color: 'var(--text-muted)' }} />
          </a>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.6rem 0.85rem', background: 'var(--input-bg)', borderRadius: 10, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Built with ❤️ using React · Capacitor · SQLite WASM
        </div>
      </div>
    </div>
  );
};
