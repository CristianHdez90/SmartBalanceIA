export const notificationIntervals=[0,30,60,600,1200,1800,3600] as const;
export const notificationIntervalKey=(userId:string)=>`balance-notification-refresh:${userId}`;
export function readNotificationInterval(userId:string) {
  try {const saved=localStorage.getItem(notificationIntervalKey(userId));const value=Number(saved);if(saved!==null&&notificationIntervals.some(i=>i===value))return value;}catch{}
  return 60;
}
