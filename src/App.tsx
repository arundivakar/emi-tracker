import React, { useState, useEffect } from 'react';
import { useDatabase } from './db/DatabaseContext';
import { dbManager } from './db/db';
import { LoansList } from './components/LoansList';
import { LoanDetail } from './components/LoanDetail';
import { LoanForm } from './components/LoanForm';
import { Dashboard } from './components/Dashboard';
import { PersonProfile } from './components/PersonProfile';
import { Calculators } from './components/Calculators';
import { Reports } from './components/Reports';
import { BackupSettings } from './components/BackupSettings';
import {
  Sun,
  Moon,
  Home,
  BarChart3,
  Users,
  Bell,
  Plus,
  Menu,
  Calculator,
  FileSpreadsheet,
  Cloud,
  Download,
  Settings,
  Info,
  Mail,
  Star
} from 'lucide-react';
import { requestNotificationPermission } from './utils/notifications';
import { formatINR, roundTo2 } from './utils/calculator';

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

type TabType = 'loans' | 'dashboard' | 'profiles' | 'calculators' | 'reports' | 'settings';

interface NavState {
  activeTab: TabType;
  selectedLoanId: number | null;
  showAddForm: boolean;
  editLoanId: number | null;
}

export const App: React.FC = () => {
  const { dbLoaded, refreshTrigger } = useDatabase();
  const [activeTab, setActiveTab] = useState<TabType>('loans');
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editLoanId, setEditLoanId] = useState<number | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [defaultCalculatorType, setDefaultCalculatorType] = useState<'emi' | 'prepay'>('emi');
  
  // Drawer & touch states
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerStats, setDrawerStats] = useState({
    totalLoans: 0,
    totalOutstanding: 0,
    monthlyEmi: 0
  });
  const [nextEmiAlert, setNextEmiAlert] = useState<any>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const loadDrawerStats = () => {
    if (!dbLoaded) return;
    try {
      const activeLoans = dbManager.runQuery("SELECT id FROM loans WHERE status = 'Active';");
      const allEmis = dbManager.runQuery(`
        SELECT e.*, l.status as loan_status 
        FROM emi_schedule e 
        JOIN loans l ON e.loan_id = l.id;
      `);

      let totalOutstanding = 0;
      let monthlyEmi = 0;

      activeLoans.forEach((loan: any) => {
        const activeEmis = allEmis.filter((e: any) => e.loan_id === loan.id);
        if (activeEmis.length > 0) {
          monthlyEmi += activeEmis[0].total_installment;
        }
      });

      allEmis.forEach((emi: any) => {
        if (emi.loan_status === 'Active' && emi.status !== 'Paid') {
          totalOutstanding += (emi.total_installment - emi.amount_paid);
        }
      });

      // Next urgent EMI query
      const pendingEmis = dbManager.runQuery(`
        SELECT e.*, l.purchase_name, l.lender_name 
        FROM emi_schedule e
        JOIN loans l ON e.loan_id = l.id
        WHERE l.status = 'Active' AND e.status != 'Paid'
        ORDER BY e.due_date ASC
        LIMIT 1;
      `);

      setDrawerStats({
        totalLoans: activeLoans.length,
        totalOutstanding: roundTo2(totalOutstanding),
        monthlyEmi: roundTo2(monthlyEmi)
      });
      setNextEmiAlert(pendingEmis[0] || null);
    } catch (e) {
      console.error('Failed to load drawer stats:', e);
    }
  };

  useEffect(() => {
    if (dbLoaded) {
      loadDrawerStats();
    }
  }, [dbLoaded, refreshTrigger]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.modal-content') || target.closest('.no-swipe') || target.closest('input') || target.closest('select') || target.closest('textarea')) {
      return;
    }
    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const diffX = e.changedTouches[0].clientX - touchStart.x;
    const diffY = e.changedTouches[0].clientY - touchStart.y;
    
    if (Math.abs(diffX) > Math.abs(diffY) * 1.5 && Math.abs(diffX) > 60) {
      const pages: TabType[] = ['loans', 'dashboard', 'profiles'];
      const currentIndex = pages.indexOf(activeTab);
      
      if (currentIndex !== -1) {
        if (diffX > 0 && currentIndex > 0) {
          navigateTo({ activeTab: pages[currentIndex - 1] });
        } else if (diffX < 0 && currentIndex < pages.length - 1) {
          navigateTo({ activeTab: pages[currentIndex + 1] });
        }
      }
    }
    setTouchStart(null);
  };

  // Navigation stack state
  const [navHistory, setNavHistory] = useState<NavState[]>([]);

  // Refs to always access the latest navigation state in the back button listener
  const navHistoryRef = React.useRef(navHistory);
  const activeTabRef = React.useRef(activeTab);
  const selectedLoanIdRef = React.useRef(selectedLoanId);
  const showAddFormRef = React.useRef(showAddForm);
  const editLoanIdRef = React.useRef(editLoanId);

  useEffect(() => {
    navHistoryRef.current = navHistory;
    activeTabRef.current = activeTab;
    selectedLoanIdRef.current = selectedLoanId;
    showAddFormRef.current = showAddForm;
    editLoanIdRef.current = editLoanId;
  }, [navHistory, activeTab, selectedLoanId, showAddForm, editLoanId]);

  // Load and apply theme
  useEffect(() => {
    if (dbLoaded) {
      try {
        const themeRes = dbManager.runQuery("SELECT value FROM settings WHERE key = 'theme';");
        if (themeRes.length > 0) {
          const loadedTheme = themeRes[0].value as 'light' | 'dark';
          setTheme(loadedTheme);
          document.documentElement.setAttribute('data-theme', loadedTheme);
        }
      } catch (e) {
        console.error('Failed to load theme setting:', e);
      }
    }
  }, [dbLoaded]);

  // Request notifications permission on start
  useEffect(() => {
    requestNotificationPermission().then(granted => {
      console.log('Notification permission status:', granted);
    });
  }, []);

  // Centralized navigation helpers
  const navigateTo = (updates: {
    activeTab?: TabType;
    selectedLoanId?: number | null;
    showAddForm?: boolean;
    editLoanId?: number | null;
    defaultCalculatorType?: 'emi' | 'prepay';
  }) => {
    const nextTab = updates.activeTab !== undefined ? updates.activeTab : activeTab;
    const nextLoanId = updates.selectedLoanId !== undefined ? updates.selectedLoanId : selectedLoanId;
    const nextShowAdd = updates.showAddForm !== undefined ? updates.showAddForm : showAddForm;
    const nextEditId = updates.editLoanId !== undefined ? updates.editLoanId : editLoanId;

    // Avoid pushing duplicate states
    if (
      nextTab === activeTab &&
      nextLoanId === selectedLoanId &&
      nextShowAdd === showAddForm &&
      nextEditId === editLoanId
    ) {
      if (updates.defaultCalculatorType !== undefined) {
        setDefaultCalculatorType(updates.defaultCalculatorType);
      }
      return;
    }

    setNavHistory(prev => [
      ...prev,
      { activeTab, selectedLoanId, showAddForm, editLoanId }
    ]);

    if (updates.activeTab !== undefined) setActiveTab(updates.activeTab);
    if (updates.selectedLoanId !== undefined) setSelectedLoanId(updates.selectedLoanId);
    if (updates.showAddForm !== undefined) setShowAddForm(updates.showAddForm);
    if (updates.editLoanId !== undefined) setEditLoanId(updates.editLoanId);
    if (updates.defaultCalculatorType !== undefined) setDefaultCalculatorType(updates.defaultCalculatorType);
  };

  const goBack = () => {
    if (navHistoryRef.current.length > 0) {
      const prevState = navHistoryRef.current[navHistoryRef.current.length - 1];
      setNavHistory(prev => prev.slice(0, -1));
      
      setActiveTab(prevState.activeTab);
      setSelectedLoanId(prevState.selectedLoanId);
      setShowAddForm(prevState.showAddForm);
      setEditLoanId(prevState.editLoanId);
      return true;
    }
    
    // Fallback: If stack is empty but we are on another tab, return to loans (home) tab
    if (activeTabRef.current !== 'loans') {
      setNavHistory([]);
      setActiveTab('loans');
      setSelectedLoanId(null);
      setShowAddForm(false);
      setEditLoanId(null);
      return true;
    }
    
    return false;
  };

  // Capacitor Native Back Button listener
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backButtonHandler = CapApp.addListener('backButton', () => {
      const handled = goBack();
      if (!handled) {
        const confirmExit = window.confirm("Do you want to exit the app?");
        if (confirmExit) {
          CapApp.exitApp();
        }
      }
    });

    return () => {
      backButtonHandler.then(h => h.remove());
    };
  }, []);

  const toggleTheme = async () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    
    if (dbLoaded) {
      try {
        await dbManager.executeSql(
          "INSERT INTO settings (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = ?;",
          [nextTheme, nextTheme]
        );
      } catch (e) {
        console.error('Failed to save theme setting:', e);
      }
    }
  };

  if (!dbLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', backgroundColor: '#111318', color: '#E8E6E1' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: '#14B8A6', fontSize: '1.6rem', letterSpacing: '-0.03em' }}>
          EMI Tracker
        </h2>
        <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(255, 255, 255, 0.08)', borderTopColor: '#14B8A6', borderRadius: '50%' }} />
        <span style={{ fontSize: '0.8rem', color: '#5C5955' }}>Initializing database...</span>
      </div>
    );
  }

  // Handle inner navigation helpers
  const handleSelectLoan = (loanId: number) => {
    navigateTo({ selectedLoanId: loanId, showAddForm: false, editLoanId: null });
  };

  const handleAddLoanClick = () => {
    navigateTo({ showAddForm: true, selectedLoanId: null, editLoanId: null });
  };

  const handleLoanCreated = (loanId: number) => {
    // Reset history when saving a new loan to avoid circular back navigation loops
    setNavHistory([]);
    setActiveTab('loans');
    setSelectedLoanId(loanId);
    setShowAddForm(false);
    setEditLoanId(null);
  };

  const renderContent = () => {
    if (selectedLoanId !== null) {
      return (
        <LoanDetail
          loanId={selectedLoanId}
          onBack={goBack}
          onEdit={(id) => {
            navigateTo({ editLoanId: id, selectedLoanId: null });
          }}
        />
      );
    }

    if (editLoanId !== null) {
      return (
        <LoanForm
          editLoanId={editLoanId}
          onSuccess={(loanId) => {
            navigateTo({ selectedLoanId: loanId, editLoanId: null });
          }}
          onCancel={goBack}
        />
      );
    }

    if (showAddForm) {
      return <LoanForm onSuccess={handleLoanCreated} onCancel={goBack} />;
    }

    // Carousel swipeable pages
    if (['loans', 'dashboard', 'profiles'].includes(activeTab)) {
      const pageIndex = ['loans', 'dashboard', 'profiles'].indexOf(activeTab);
      return (
        <div 
          className="swipe-viewport"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className="swipe-container"
            style={{ 
              transform: `translateX(-${pageIndex * 100 / 3}%)`,
              width: '300%'
            }}
          >
            <div className={`swipe-page ${activeTab === 'loans' ? 'active' : 'inactive'}`} style={{ width: '33.333%' }}>
              <LoansList 
                onSelectLoan={handleSelectLoan} 
                onNavigate={(tab, params) => navigateTo({ activeTab: tab, selectedLoanId: null, showAddForm: false, editLoanId: null, ...params })}
                onOpenDrawer={() => setShowDrawer(true)}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </div>
            <div className={`swipe-page ${activeTab === 'dashboard' ? 'active' : 'inactive'}`} style={{ width: '33.333%' }}>
              <Dashboard onSelectLoan={handleSelectLoan} />
            </div>
            <div className={`swipe-page ${activeTab === 'profiles' ? 'active' : 'inactive'}`} style={{ width: '33.333%' }}>
              <PersonProfile onSelectLoan={handleSelectLoan} />
            </div>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'calculators':
        return <Calculators defaultType={defaultCalculatorType} />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <BackupSettings />;
      default:
        return (
          <div 
            className="swipe-viewport"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="swipe-container"
              style={{ transform: `translateX(0%)`, width: '300%' }}
            >
              <div className="swipe-page active" style={{ width: '33.333%' }}>
                <LoansList 
                  onSelectLoan={handleSelectLoan} 
                  onNavigate={(tab, params) => navigateTo({ activeTab: tab, selectedLoanId: null, showAddForm: false, editLoanId: null, ...params })}
                  onOpenDrawer={() => setShowDrawer(true)}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                />
              </div>
            </div>
          </div>
        );
    }
  };

  const isHomeView = activeTab === 'loans' && selectedLoanId === null && !showAddForm && editLoanId === null;
  const showBottomNav = ['loans', 'dashboard', 'profiles'].includes(activeTab) && selectedLoanId === null && !showAddForm && editLoanId === null;

  return (
    <div className="app-container">
      {/* Drawer Overlay */}
      <div className={`drawer-overlay ${showDrawer ? 'open' : ''}`} onClick={() => setShowDrawer(false)}></div>

      {/* Drawer Menu */}
      <div className={`drawer-content ${showDrawer ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3 className="drawer-title">EMI Tracker</h3>
          <span className="drawer-version">v1.0.0</span>
          <div className="drawer-summary">
            <div className="drawer-summary-item">
              <span>Active Loans:</span>
              <strong>{drawerStats.totalLoans}</strong>
            </div>
            <div className="drawer-summary-item">
              <span>Monthly EMI:</span>
              <strong>{formatINR(drawerStats.monthlyEmi)}</strong>
            </div>
            <div className="drawer-summary-item">
              <span>Total Outstanding:</span>
              <strong>{formatINR(drawerStats.totalOutstanding)}</strong>
            </div>
          </div>
        </div>
        <div className="drawer-menu">
          <button 
            className={`drawer-item ${activeTab === 'loans' ? 'active' : ''}`}
            onClick={() => { setActiveTab('loans'); setShowDrawer(false); }}
          >
            <Home size={18} /> <span>Home</span>
          </button>
          <button 
            className={`drawer-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setShowDrawer(false); }}
          >
            <BarChart3 size={18} /> <span>Dashboard</span>
          </button>
          <button 
            className={`drawer-item ${activeTab === 'profiles' ? 'active' : ''}`}
            onClick={() => { setActiveTab('profiles'); setShowDrawer(false); }}
          >
            <Users size={18} /> <span>People</span>
          </button>
          <button 
            className={`drawer-item ${activeTab === 'calculators' ? 'active' : ''}`}
            onClick={() => { navigateTo({ activeTab: 'calculators', defaultCalculatorType: 'emi' }); setShowDrawer(false); }}
          >
            <Calculator size={18} /> <span>EMI Calculator</span>
          </button>
          <button 
            className={`drawer-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => { setActiveTab('reports'); setShowDrawer(false); }}
          >
            <FileSpreadsheet size={18} /> <span>Reports</span>
          </button>
          <button 
            className="drawer-item"
            onClick={() => { 
              setShowDrawer(false);
              alert(nextEmiAlert ? `Next Due Payment: ${nextEmiAlert.purchase_name} (${formatINR(nextEmiAlert.total_installment)} due on ${nextEmiAlert.due_date})` : 'No upcoming reminders.');
            }}
          >
            <Bell size={18} /> <span>Reminders</span>
          </button>
          <button 
            className={`drawer-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setShowDrawer(false); }}
          >
            <Cloud size={18} /> <span>Backup & Restore</span>
          </button>
          <button 
            className="drawer-item"
            onClick={() => { 
              setActiveTab('reports');
              setShowDrawer(false);
            }}
          >
            <Download size={18} /> <span>Export Data</span>
          </button>
          <button 
            className="drawer-item"
            onClick={() => {
              toggleTheme();
            }}
          >
            <Moon size={18} /> <span>Theme Settings ({theme === 'light' ? 'Light' : 'Dark'})</span>
          </button>
          <button 
            className={`drawer-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setShowDrawer(false); }}
          >
            <Settings size={18} /> <span>App Settings</span>
          </button>
          <button 
            className="drawer-item"
            onClick={() => { 
              setShowDrawer(false);
              alert("EMI Tracker v1.0.0\nAn offline-first personal finance application for tracking loan EMIs.\nBuilt with Vite + React + SQLite Wasm.");
            }}
          >
            <Info size={18} /> <span>About App</span>
          </button>
          <button 
            className="drawer-item"
            onClick={() => {
              setShowDrawer(false);
              window.location.href = "mailto:support@emitracker.com?subject=EMI Tracker Feedback";
            }}
          >
            <Mail size={18} /> <span>Contact Support</span>
          </button>
          <button 
            className="drawer-item"
            onClick={() => {
              setShowDrawer(false);
              alert("Thank you for rating EMI Tracker! Your feedback is highly appreciated.");
            }}
          >
            <Star size={18} /> <span>Rate App</span>
          </button>
        </div>
      </div>

      {/* Header - hidden on home screen (home has its own gradient header) */}
      {!isHomeView && (
      <header className="app-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button 
            className="btn-ghost-icon" 
            onClick={() => setShowDrawer(true)}
            title="Menu"
          >
            <Menu size={20} />
          </button>
          <h1 
            onClick={() => { navigateTo({ activeTab: 'loans', selectedLoanId: null, showAddForm: false, editLoanId: null }); }} 
            style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', margin: 0 }}
          >
            EMI Tracker
          </h1>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '0.2rem' }}>
          <button
            className="btn-ghost-icon"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button 
            className="btn-ghost-icon" 
            onClick={() => {
              alert(nextEmiAlert ? `Next Due Payment: ${nextEmiAlert.purchase_name} (${formatINR(nextEmiAlert.total_installment)} due on ${nextEmiAlert.due_date})` : 'No upcoming payments.');
            }}
            title="Notifications"
          >
            <Bell size={18} />
          </button>
        </div>
      </header>
      )}

      {/* Main body content */}
      <main className={`app-main${isHomeView ? ' app-main-home' : ''}`}>
        {/* Swipe Indicators Dots removed for minimalist look */}

        {/* Dynamic component mounting */}
        {renderContent()}
      </main>

      {/* Bottom Navigation Bar */}
      {showBottomNav && (
        <nav className="app-bottom-nav">
          <button className={`app-bottom-nav-item ${activeTab === 'loans' ? 'active' : ''}`} onClick={() => setActiveTab('loans')}>
            <Home size={22} />
            <span>Home</span>
          </button>
          <button className={`app-bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <BarChart3 size={22} />
            <span>Dashboard</span>
          </button>
          <button className={`app-bottom-nav-item ${activeTab === 'profiles' ? 'active' : ''}`} onClick={() => setActiveTab('profiles')}>
            <Users size={22} />
            <span>People</span>
          </button>
        </nav>
      )}

      {/* Floating Action Button (FAB) */}
      {activeTab === 'loans' && selectedLoanId === null && !showAddForm && editLoanId === null && (
        <button 
          className="fab-add" 
          style={{ bottom: showBottomNav ? '5rem' : '2rem' }}
          onClick={handleAddLoanClick} 
          title="Add New Loan"
        >
          <Plus size={18} />
          <span>Add Loan</span>
        </button>
      )}
    </div>
  );
};
