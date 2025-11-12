"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenStorageService = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const TOKEN_FILE_NAME = 'secure-volume-tokens.json';
const getTokenFilePath = () => {
    return path_1.default.join(electron_1.app.getPath('userData'), TOKEN_FILE_NAME);
};
const buildAccount = ({ pnIdentifier, pnName, publicKey }) => {
    const identityKey = pnIdentifier?.trim() || pnName?.trim() || publicKey.trim();
    return `pn-secure-volume::${identityKey}`;
};
const loadTokenStore = async () => {
    const filePath = getTokenFilePath();
    try {
        const content = await fs_1.promises.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return {};
    }
};
const saveTokenStore = async (store) => {
    const filePath = getTokenFilePath();
    await fs_1.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
    await fs_1.promises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
};
exports.TokenStorageService = {
    async save(identity, authToken) {
        if (!authToken || !authToken.trim()) {
            return;
        }
        const store = await loadTokenStore();
        const account = buildAccount(identity);
        store[account] = authToken.trim();
        await saveTokenStore(store);
    },
    async load(identity) {
        const store = await loadTokenStore();
        const account = buildAccount(identity);
        return store[account] || null;
    },
    async clear(identity) {
        const store = await loadTokenStore();
        const account = buildAccount(identity);
        delete store[account];
        await saveTokenStore(store);
    }
};
exports.default = exports.TokenStorageService;
