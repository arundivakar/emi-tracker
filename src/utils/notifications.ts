import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'error' | 'success';
  date: string;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch (e) {
      console.error('Capacitor notifications permission error:', e);
      return false;
    }
  } else if ('Notification' in window) {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.error('Web notification permission error:', e);
      return false;
    }
  }
  return false;
}

export async function scheduleLocalNotification(
  id: number,
  title: string,
  body: string,
  scheduledTime: Date
) {
  if (scheduledTime.getTime() < Date.now()) return;

  if (Capacitor.isNativePlatform()) {
    try {
      const hasPermission = await LocalNotifications.checkPermissions();
      if (hasPermission.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
      
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            schedule: { at: scheduledTime },
            sound: 'default',
            actionTypeId: 'OPEN_EMI_TRACKER',
            extra: null,
          },
        ],
      });
      console.log(`Scheduled native notification "${title}" for ${scheduledTime.toISOString()}`);
    } catch (e) {
      console.error('Failed to schedule native notification:', e);
    }
  } else if ('Notification' in window && Notification.permission === 'granted') {
    // Note: Web browsers do not support scheduling in the background easily without push services,
    // so scheduling is fallback. We save it in SQLite and display in-app notifications.
    console.log(`Web schedule notification registered: "${title}" for ${scheduledTime.toISOString()}`);
  }
}

// Clear all scheduled notifications
export async function cancelAllNotifications() {
  if (Capacitor.isNativePlatform()) {
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }
    } catch (e) {
      console.error('Failed to cancel notifications:', e);
    }
  }
}

export async function rescheduleAllEmiNotifications(activeLoans: any[], emiSchedules: any[]) {
  // First, cancel all existing scheduled notifications
  await cancelAllNotifications();
  
  for (const loan of activeLoans) {
    if (loan.status !== 'Active') continue;
    
    // Find first pending/overdue EMI for this loan
    const pendingEmis = emiSchedules
      .filter(e => e.loan_id === loan.id && (e.status === 'Pending' || e.status === 'Overdue'))
      .sort((a, b) => a.emi_number - b.emi_number);
      
    if (pendingEmis.length === 0) continue;
    
    const nextEmi = pendingEmis[0];
    const dueDate = new Date(nextEmi.due_date);
    
    // Schedule 7 days before
    const date7 = new Date(dueDate);
    date7.setDate(date7.getDate() - 7);
    date7.setHours(9, 0, 0, 0);
    
    // Schedule 3 days before
    const date3 = new Date(dueDate);
    date3.setDate(date3.getDate() - 3);
    date3.setHours(9, 0, 0, 0);
    
    // Schedule on due date
    const dateDue = new Date(dueDate);
    dateDue.setHours(9, 0, 0, 0);
    
    // Schedule overdue (1 day after)
    const dateOverdue = new Date(dueDate);
    dateOverdue.setDate(dateOverdue.getDate() + 1);
    dateOverdue.setHours(10, 0, 0, 0);
    
    const baseId = loan.id * 100;
    
    await scheduleLocalNotification(
      baseId + 1,
      `Upcoming EMI - ${loan.purchase_name}`,
      `EMI of ₹${nextEmi.total_installment} is due in 7 days on ${nextEmi.due_date}.`,
      date7
    );
    await scheduleLocalNotification(
      baseId + 2,
      `Upcoming EMI - ${loan.purchase_name}`,
      `EMI of ₹${nextEmi.total_installment} is due in 3 days on ${nextEmi.due_date}.`,
      date3
    );
    await scheduleLocalNotification(
      baseId + 3,
      `EMI Due Today - ${loan.purchase_name}`,
      `EMI of ₹${nextEmi.total_installment} is due today!`,
      dateDue
    );
    await scheduleLocalNotification(
      baseId + 4,
      `Overdue EMI - ${loan.purchase_name}`,
      `EMI of ₹${nextEmi.total_installment} was due on ${nextEmi.due_date} and is now overdue!`,
      dateOverdue
    );
  }
}

