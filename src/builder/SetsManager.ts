import { reactive, toRef, watch, WatchStopHandle } from 'vue';
import { SetData } from './SetData';
import { Briq } from './Briq';

import { hexUuid } from '../Uuid';

import { watchEffect } from 'vue';
import { logDebug } from '../Messages';

import { CONF } from '@/Conf';

import * as fflate from 'fflate';

export type SET_STATUS = 'ONCHAIN_ONLY' | 'ONCHAIN_LOADED' | 'ONCHAIN_EDITING' | 'LOCAL';

const SETINFO_VERSION = 2;

export class SetInfo {
    id: string;
    setData!: SetData;
    booklet: string | undefined;
    lastUpdate: number;

    // If this is non-null, the local set is hidden.
    // This is used to recover the local set if the minting failed.
    onchainId?: string;

    constructor(sid: string, setData?: SetData) {
        this.id = sid;
        this.lastUpdate = Date.now();
        if (setData)
            this.setData = setData;
    }

    serialize() {
        const raw = JSON.stringify(this.setData.serialize());
        // Use compression to get 10-20x size gains, since Chrome prevents local storage above 5MB.
        const data = fflate.strFromU8(fflate.zlibSync(fflate.strToU8(raw)), true);
        return {
            version: SETINFO_VERSION,
            id: this.id,
            booklet: this.booklet,
            setData: data,
            lastUpdate: this.lastUpdate,
            onchainId: this.onchainId,
        };
    }

    deserialize(data: any) {
        this.id = data.id;
        this.booklet = data?.booklet;
        this.lastUpdate = data?.lastUpdate || Date.now();
        this.onchainId = data?.onchainId;

        const setData = data.version === 1 ? data.local : data.setData;
        try {
            const raw = fflate.strFromU8(fflate.unzlibSync(fflate.strToU8(setData, true)));
            this.setData = new SetData(data.id).deserialize(JSON.parse(raw));
        } catch(_) {
            // used for tests
            this.setData = new SetData(data.id).deserialize(setData);
        }

        // TODO: check coherence.
        return this;
    }

    getSet() {
        return this.setData;
    }

    setLocal(set: SetData) {
        this.setData = set;
        return this;
    }
}

export class SetsManager {
    setList: Array<string> = [];
    setsInfo: { [setId: string]: SetInfo } = {};

    clear() {
        this.setList.splice(0, this.setList.length);
        for (const key in this.setsInfo)
            delete this.setsInfo[key];
    }

    /**
     * Load all sets from local storage. Note that this doesn't clear any preloaded sets (such as on-chain ones).
     */
    async loadFromStorage() {
        for (const [sid, setData] of Object.entries(window.localStorage)) {
            if (!sid.startsWith('briq_set'))
                continue;
            try {
                const data = JSON.parse(setData);
                const info = new SetInfo(sid).deserialize(data);
                this.setList.push(info.id);
                this.setsInfo[info.id] = info;
            } catch (e) {
                console.info('Could not parse stored set', sid, 'error:', e);
                window.localStorage.removeItem(sid);
                window.localStorage.removeItem(sid.replace('briq_set_', 'set_preview_'));
            }
        }
    }

    revealHiddenSetsMaybe() {
        for (const sid in this.setsInfo) {
            const info = this.setsInfo[sid];
            if (!info.onchainId)
                continue;
            // Reveal the sets that are over a day old.
            if (Date.now() - info.lastUpdate > 24*3600*1000) {
                info.onchainId = undefined;
                info.getSet().name += ' (recovered)';
            }
        }
    }

    getInfo(sid: string) {
        return this.setsInfo[sid];
    }

    getBookletSet(booklet_id: string) {
        for (const sid in this.setsInfo)
            if (this.setsInfo[sid].booklet === booklet_id)
                return this.setsInfo[sid].getSet();
    }

    getHiddenSetInfo(onchainId: string) {
        for (const sid in this.setsInfo)
            if (this.setsInfo[sid].onchainId === onchainId)
                return this.setsInfo[sid];
    }

    /**
     * Return a random local set. Used to easily query a local set, since the builder needs to always have one for now.
     * @returns a local set, or undefined if none exist.
     */
    getLocalSet() {
        for (const sid in this.setsInfo)
            if (!this.setsInfo[sid].booklet && !this.setsInfo[sid].onchainId)
                return this.setsInfo[sid].setData;
    }

    createLocalSet() {
        const set = new SetData(hexUuid());
        set.name = 'New Set';
        this.registerLocalSet(set);
        return set;
    }

    /**
     * Register a new local set.
     */
    registerLocalSet(set: SetData) {
        if (this.setsInfo[set.id])
            throw new Error('Set with ID ' + set.id + ' already exists');
        this.setsInfo[set.id] = new SetInfo(set.id, set);
        this.setList.push(set.id);
        return this.setsInfo[set.id];
    }

    /**
     * Delete the local copy of a set.
     * @param sid ID of the set.
     */
    deleteLocalSet(sid: string) {
        const data = this.setsInfo[sid];
        if (!data)
            return;
        const idx = this.setList.indexOf(sid);
        this.setList.splice(idx, 1);
        delete this.setsInfo[sid];
        // Delete localstorage after for it may have been reloaded otherwise.
        window.localStorage.removeItem('briq_set_' + sid);
        window.localStorage.removeItem('set_preview_' + sid);
    }

    hideLocalSet(localId: string, onchainId: string) {
        const data = this.setsInfo[localId];
        if (!data)
            return;
        data.onchainId = onchainId;
    }

    duplicateLocally(set: SetData) {
        const copy = setsManager.createLocalSet();
        window.localStorage.setItem(`set_preview_${copy.id}`, window.localStorage.getItem(`set_preview_${set.id}`) || '');
        const data = set.serialize();
        delete data.id;
        copy.deserialize(data);
        copy.name = `Copy of ${copy.getName()}`
        return copy;
    }
}

const storageHandlers: { [sid: string]: WatchStopHandle } = {};
export function synchronizeSetsLocally(force = false) {
    for (const sid in setsManager.setsInfo) {
        if (storageHandlers[sid])
            continue;
        storageHandlers[sid] = watch([toRef(setsManager.setsInfo[sid], 'booklet'), toRef(setsManager.setsInfo[sid], 'setData')], () => {
            const info = setsManager.setsInfo[sid];
            logDebug('SET STORAGE HANDLER - Serializing set ', sid);
            if (!info) {
                // Delete
                if (window.localStorage.getItem('briq_set_' + sid)) {
                    logDebug('SET STORAGE HANDLER - deleted local set', sid);
                    window.localStorage.removeItem('briq_set_' + sid);
                    window.localStorage.removeItem('set_preview_' + sid);
                }
                if (!info) {
                    logDebug('SET STORAGE HANDLER - unwatching ', sid);
                    storageHandlers[sid]();
                    delete storageHandlers[sid];
                }
                return;
            }
            info.lastUpdate = Date.now();
            window.localStorage.setItem('briq_set_' + sid, JSON.stringify(info.serialize()));
        }, {
            deep: true,
            immediate: force,
        });
    }
}

export const setsManager = reactive(new SetsManager());
setsManager.loadFromStorage().then(_ => {
    let firstTime = true;
    watchEffect(() => {
        synchronizeSetsLocally(!firstTime);
        firstTime = false;
    });
    logDebug('SET STORAGE setup')
});


import { defaultModel } from '@/conf/realms';

// TODO: move this elsewhere?
export function checkForInitialGMSet() {
    if (setsManager.setList.length)
        return;
    if (!window.localStorage.getItem('has_initial_gm_set')) {
        window.localStorage.setItem('has_initial_gm_set', 'true');
        const set = new SetData(hexUuid());
        set.name = 'GM';
        const data: { pos: [number, number, number]; color: string }[] =
            CONF.theme === 'realms'
                ? defaultModel
                : [
                    { pos: [4, 0, 0], color: '#c5ac73' },
                    { pos: [3, 0, 0], color: '#c5ac73' },
                    { pos: [2, 0, 0], color: '#c5ac73' },
                    { pos: [1, 0, 0], color: '#c5ac73' },
                    { pos: [1, 1, 0], color: '#e6de83' },
                    { pos: [1, 2, 0], color: '#e6de83' },
                    { pos: [2, 2, 0], color: '#e6de83' },
                    { pos: [4, 1, 0], color: '#62bdf6' },
                    { pos: [4, 2, 0], color: '#62bdf6' },
                    { pos: [4, 3, 0], color: '#62bdf6' },
                    { pos: [4, 4, 0], color: '#e6de83' },
                    { pos: [3, 4, 0], color: '#416aac' },
                    { pos: [2, 4, 0], color: '#416aac' },
                    { pos: [1, 4, 0], color: '#416aac' },
                    { pos: [-1, 0, 0], color: '#394183' },
                    { pos: [-5, 0, 0], color: '#416aac' },
                    { pos: [-5, 1, 0], color: '#416aac' },
                    { pos: [-5, 2, 0], color: '#416aac' },
                    { pos: [-5, 3, 0], color: '#416aac' },
                    { pos: [-5, 4, 0], color: '#416aac' },
                    { pos: [-1, 1, 0], color: '#394183' },
                    { pos: [-1, 2, 0], color: '#394183' },
                    { pos: [-1, 3, 0], color: '#394183' },
                    { pos: [-1, 4, 0], color: '#394183' },
                    { pos: [-2, 4, 0], color: '#e6de83' },
                    { pos: [-4, 4, 0], color: '#e6de83' },
                    { pos: [-3, 3, 0], color: '#c5ac73' },
                ];
        for (const briqData of data)
            set.placeBriq(...briqData.pos, new Briq(CONF.defaultMaterial, briqData.color));
        setsManager.registerLocalSet(set);
        return set;
    }
}
