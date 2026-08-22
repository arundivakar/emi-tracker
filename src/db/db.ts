import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { IndexedDBStorage } from './idb';

class DatabaseManager {
  private db: Database | null = null;
  private storage = new IndexedDBStorage();
  private dbKey = 'sqlite_db_binary';
  private isInitialized = false;

  async init(): Promise<Database> {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    try {
      // 1. Initialize sql.js (locating wasm from local public folder)
      const SQL = await initSqlJs({
        locateFile: () => `/sql-wasm.wasm`,
      });

      // 2. Try loading existing binary from IndexedDB
      const savedBinary = await this.storage.get(this.dbKey);

      if (savedBinary) {
        try {
          this.db = new SQL.Database(savedBinary);
          console.log('Loaded existing SQLite database from IndexedDB.');
        } catch (err) {
          console.error('Failed to parse saved database binary. Creating new one.', err);
          this.db = new SQL.Database();
        }
      } else {
        this.db = new SQL.Database();
        console.log('Created new SQLite database.');
      }

      // 3. Enable foreign keys and set up schema
      this.db.run('PRAGMA foreign_keys = ON;');
      this.createSchema();
      this.seedInitialData();

      // 4. Save to ensure schema persists
      await this.save();

      this.isInitialized = true;
      return this.db;
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  private createSchema() {
    if (!this.db) return;

    // ── EXISTING TABLES (unchanged) ───────────────────────────────

    // Create Persons table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Loans table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_name TEXT NOT NULL,
        person_id INTEGER NOT NULL,
        purchase_date TEXT NOT NULL,
        loan_amount REAL NOT NULL,
        interest_rate REAL NOT NULL,
        period_months INTEGER NOT NULL,
        processing_fee REAL DEFAULT 0,
        gst_processing_fee_rate REAL DEFAULT 18,
        down_payment REAL DEFAULT 0,
        emi_start_date TEXT NOT NULL,
        lender_name TEXT NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'Active',
        closure_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(person_id) REFERENCES persons(id)
      );
    `);

    // Create EMI Schedule table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS emi_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        emi_number INTEGER NOT NULL,
        due_date TEXT NOT NULL,
        opening_balance REAL NOT NULL,
        principal_component REAL NOT NULL,
        interest_component REAL NOT NULL,
        gst_on_interest REAL NOT NULL,
        total_installment REAL NOT NULL,
        closing_balance REAL NOT NULL,
        status TEXT DEFAULT 'Pending',
        payment_date TEXT,
        amount_paid REAL DEFAULT 0,
        remarks TEXT,
        FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE CASCADE
      );
    `);

    // Create Settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // ── NEW TABLES (additive — IF NOT EXISTS, never breaks existing data) ──

    // Bank / Cash Accounts
    this.db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name TEXT NOT NULL,
        bank TEXT,
        account_type TEXT NOT NULL DEFAULT 'savings',
        last4 TEXT,
        current_balance REAL DEFAULT 0,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Credit Cards
    this.db.run(`
      CREATE TABLE IF NOT EXISTS credit_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issuer TEXT NOT NULL,
        card_name TEXT NOT NULL,
        nickname TEXT,
        network TEXT DEFAULT 'Visa',
        last4 TEXT NOT NULL,
        credit_limit REAL DEFAULT 0,
        current_outstanding REAL DEFAULT 0,
        statement_date INTEGER,
        due_date_day INTEGER,
        min_due REAL DEFAULT 0,
        annual_fee REAL DEFAULT 0,
        reward_type TEXT,
        linked_account_id INTEGER,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(linked_account_id) REFERENCES accounts(id) ON DELETE SET NULL
      );
    `);

    // Unified Transactions
    this.db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        merchant TEXT,
        category TEXT,
        txn_date TEXT NOT NULL,
        txn_time TEXT,
        account_id INTEGER,
        credit_card_id INTEGER,
        to_account_id INTEGER,
        linked_loan_id INTEGER,
        linked_emi_id INTEGER,
        source TEXT DEFAULT 'manual',
        status TEXT DEFAULT 'confirmed',
        sms_reference TEXT,
        confidence TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY(credit_card_id) REFERENCES credit_cards(id) ON DELETE SET NULL,
        FOREIGN KEY(to_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY(linked_loan_id) REFERENCES loans(id) ON DELETE SET NULL
      );
    `);
  }

  private seedInitialData() {
    if (!this.db) return;

    // Check if 'Self' person exists, if not add it
    const persons = this.runQuery('SELECT * FROM persons LIMIT 1;');
    if (persons.length === 0) {
      this.db.run("INSERT INTO persons (name) VALUES ('Self');");
    }

    // Check if theme setting exists
    const theme = this.runQuery("SELECT * FROM settings WHERE key = 'theme';");
    if (theme.length === 0) {
      this.db.run("INSERT INTO settings (key, value) VALUES ('theme', 'light');");
    }

    // Seed new settings keys (safe — only if not already present)
    const reserve = this.runQuery("SELECT * FROM settings WHERE key = 'reserve_amount';");
    if (reserve.length === 0) {
      this.db.run("INSERT INTO settings (key, value) VALUES ('reserve_amount', '0');");
    }
  }

  // Persists the current in-memory DB back to IndexedDB
  async save(): Promise<void> {
    if (!this.db) return;
    try {
      const binary = this.db.export();
      await this.storage.set(this.dbKey, binary);
    } catch (err) {
      console.error('Failed to save SQLite database:', err);
    }
  }

  // Executes SELECT queries and returns array of objects
  runQuery(sql: string, params: any[] = []): any[] {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }

    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error('SQL query execution error:', sql, params, err);
      throw err;
    }
  }

  // Executes INSERT, UPDATE, DELETE queries and auto-saves
  async executeSql(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }

    try {
      this.db.run(sql, params);
      const changes = this.db.getRowsModified();
      
      // Get the last inserted row id
      let lastInsertRowid = 0;
      const res = this.db.exec('SELECT last_insert_rowid() as id;');
      if (res.length > 0 && res[0].values.length > 0) {
        lastInsertRowid = res[0].values[0][0] as number;
      }

      await this.save();
      return { changes, lastInsertRowid };
    } catch (err) {
      console.error('SQL modification execution error:', sql, params, err);
      throw err;
    }
  }

  // Exports the SQLite raw database binary (Uint8Array)
  exportDatabaseBinary(): Uint8Array {
    if (!this.db) {
      throw new Error('Database not initialized.');
    }
    return this.db.export();
  }

  // Imports a raw database binary and saves it to IndexedDB
  async importDatabaseBinary(binary: Uint8Array): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: () => `/sql-wasm.wasm`,
    });
    this.db = new SQL.Database(binary);
    // Ensure schema and settings exist, then save
    this.db.run('PRAGMA foreign_keys = ON;');
    this.createSchema();
    this.seedInitialData();
    await this.save();
  }
}

export const dbManager = new DatabaseManager();
