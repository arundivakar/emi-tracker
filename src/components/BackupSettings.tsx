import React from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { Download, Upload, ShieldAlert } from 'lucide-react';

export const BackupSettings: React.FC = () => {
  const { triggerRefresh } = useDatabase();

  // --- LOCAL OFFLINE SQLITE BACKUPS ---

  const handleLocalExport = () => {
    try {
      const binary = dbManager.exportDatabaseBinary();
      const blob = new Blob([binary as any], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `emi_tracker_india_${dateStr}.sqlite`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert('Local export failed. See logs.');
      console.error(e);
    }
  };

  const handleLocalImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer;
          const u8array = new Uint8Array(buffer);
          
          if (window.confirm('WARNING: Importing this file will overwrite all your current data! Do you want to proceed?')) {
            await dbManager.importDatabaseBinary(u8array);
            alert('Database successfully restored from local backup!');
            triggerRefresh();
          }
        } catch (err) {
          console.error(err);
          alert('Failed to parse database file. Make sure it is a valid SQLite file.');
        }
      };
      
      reader.readAsArrayBuffer(file);
    }
  };



  return (
    <div className="grid-cols-12 animate-fade">
      {/* Local Offline backups */}
      <div className="col-span-6 card">
        <div className="card-header">
          <h3 className="card-title">Local Offline Storage Backup</h3>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Download your complete EMI, profile, and payment data locally as a single SQLite database file. You can import it back at any time to restore your records.
        </p>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button className="btn btn-primary" onClick={handleLocalExport}>
            <Download size={16} /> Export SQLite Database File
          </button>

          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={16} /> Restore from SQLite File
            <input
              type="file"
              accept=".sqlite, .db, .sqlite3"
              onChange={handleLocalImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '0.4rem', backgroundColor: 'var(--input-bg)', padding: '0.8rem', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <ShieldAlert size={18} style={{ color: 'var(--status-partial)', flexShrink: 0 }} />
          <span>
            Offline backups preserve all loan schedules, custom remarks, person profiles, and settings. Store this file in a safe location.
          </span>
        </div>
      </div>
    </div>
  );
};
