import type { DatabaseClient } from './database';
import type { InboxNotification, NotificationCandidate } from '../domain/notification-inbox';

export class NotificationInboxRepository {
  constructor(private db:DatabaseClient,private userId:string){}
  async refresh(items:NotificationCandidate[],now=Date.now()) {
    // A transaction avoids a temporarily empty bell when several tabs refresh together.
    await this.db.batch([
      this.db.prepare('UPDATE notification_inbox SET active=0 WHERE user_id=? AND active=1').bind(this.userId),
      ...items.map(item=>this.db.prepare(`INSERT INTO notification_inbox(user_id,id,day,kind,title,body,section,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,body=excluded.body,active=1,updated_at=excluded.updated_at`)
        .bind(this.userId,item.id,item.day,item.kind,item.title,item.body,item.section,now,now)),
    ]);
    return this.list();
  }
  async list() {
    const items=(await this.db.prepare(`SELECT n.id,n.day,n.kind,n.title,n.body,n.section,n.active,n.read_at AS readAt,n.created_at AS createdAt,o.id AS targetId,o.month AS targetMonth FROM notification_inbox n LEFT JOIN obligations o ON o.user_id=n.user_id AND n.kind='payment' AND n.id='payment:'||o.id||':'||n.day WHERE n.user_id=? ORDER BY (n.active=1 AND n.read_at IS NULL) DESC,n.created_at DESC,n.id LIMIT 100`).bind(this.userId).all<InboxNotification>()).results.map(item=>({...item,active:!!item.active}));
    const count=await this.db.prepare('SELECT COUNT(*) AS total FROM notification_inbox WHERE user_id=? AND active=1 AND read_at IS NULL').bind(this.userId).first<{total:number}>();
    return {items,unread:count?.total??0};
  }
  async markRead(id:string,now=Date.now()) {
    const changed=await this.db.prepare('UPDATE notification_inbox SET read_at=COALESCE(read_at,?) WHERE user_id=? AND id=?').bind(now,this.userId,id).run();
    return changed.meta.changes>0;
  }
}
