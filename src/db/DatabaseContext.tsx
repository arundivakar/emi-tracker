import React, { createContext, useContext, useState, useEffect } from 'react';
import { dbManager } from './db';

interface DatabaseContextType {
  dbLoaded: boolean;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbLoaded, setDbLoaded] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    let active = true;
    dbManager.init()
      .then(() => {
        if (active) {
          setDbLoaded(true);
        }
      })
      .catch(err => {
        console.error('Failed to initialize database context:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <DatabaseContext.Provider value={{ dbLoaded, refreshTrigger, triggerRefresh }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};
