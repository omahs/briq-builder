import { Component, h, reactive, watchEffect } from 'vue';
import { maybeStore } from './chain/WalletLoading';
import { logDebug } from './Messages';

import { hexUuid } from '@/Uuid';
import { ExplorerTxUrl } from './chain/Explorer';
import { APP_ENV } from './Meta';
import NotificationVue from './components/Notification.vue';

export type NotificationLevel = 'info' | 'warning' | 'success' | 'error';

interface Popup {
    _uid: any;
    level: NotificationLevel;
    title: string;
    component: Component;
}

export const notificationPopups = reactive([] as Popup[]);

export function pushPopup(level = 'info' as NotificationLevel, title: string, message: string | Component) {
    notificationPopups.push({
        _uid: hexUuid(),
        level,
        title,
        component: typeof message === 'string' ? h('p', { class: 'whitespace-pre' }, message) : message,
    })
}

export function HashVue(tx_hash: string) {
    return h('p', [
        'Hash: ',
        h('a', {
            class: 'text-primary',
            href: ExplorerTxUrl(tx_hash),
            target: '_blank',
        }, [`${tx_hash.slice(0, 6)}...${tx_hash.slice(-4)}`],
        ),
    ]);
}

const NOTIFICATION_STORAGE_VERSION = 1;

export class Notification {
    type = 'text';
    version = 1;
    timestamp: number;
    read = false;
    level = 'info' as NotificationLevel;

    // Mark that this notification is relevant for a given user.
    // Intended as sort of opaque, current format is network/user_address
    user_id: string | undefined;

    title: string;
    data: any;

    constructor(data: any) {
        this.title = data.title;
        this.type = data.type || 'text';
        this.read = data.read || false;
        this.timestamp = data.timestamp || Date.now();
        this.user_id = data.user_id ?? maybeStore.value?.user_id;
        this.level = data.level || 'info';
        this.data = data.data;
    }

    /** For convenience, allow pushing to the manager from a notification type so you only need to import that type. */
    push(maybePopup = false) {
        notificationsManager.push(this, maybePopup);
        return this;
    }

    shouldShow() {
        return !this.user_id || maybeStore.value?.user_id === this.user_id;
    }

    serialize() {
        return {
            type: this.type,
            read: this.read,
            timestamp: this.timestamp,
            user_id: this.user_id,
            level: this.level,
            data: this.data,
            title: this.title,
        };
    }
}

// TODO: redo this all Toast system, it should use the same logic as the actual notifications, this is braindead.
function dispatchPopup(notif: Notification) {
    pushPopup(notif.level, notif.title, h(NotificationVue, { notif, toast: true }))
}

class NotificationManager {
    notifications = [] as Notification[];

    push(notif: Notification, maybePopup = false) {
        this.notifications.push(notif);
        if (!notif.read && maybePopup) {
            dispatchPopup(notif);
            notif.read = true;
        }
    }

    _setupDiskSync() {
        try {
            const notifs = JSON.parse(window.localStorage.getItem('notifications')!)
            if (notifs.version !== NOTIFICATION_STORAGE_VERSION)
                throw new Error();
            for (const notifData of notifs.notifications)
                this.push(new Notification(notifData), true);
        } catch(_) {
            // otherwise ignored
            if (APP_ENV === 'dev')
                console.error(_);
        }
        logDebug('NOTIF MGR - SETUP');
        watchEffect(() => {
            logDebug('SERIALIZING NOTIFICATIONS')
            window.localStorage.setItem('notifications', JSON.stringify({
                version: NOTIFICATION_STORAGE_VERSION,
                notifications: this.notifications.map(x => x.serialize()),
            }))
        });
    }
}

export const notificationsManager = reactive(new NotificationManager());
notificationsManager._setupDiskSync();
