"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeychainService = void 0;
const keytar_1 = __importDefault(require("keytar"));
const SERVICE_NAME = 'com.parnoir.secure-volume';
const buildAccount = ({ pnIdentifier, pnName, publicKey }) => {
    const identityKey = pnIdentifier?.trim() || pnName?.trim() || publicKey.trim();
    return `pn-secure-volume::${identityKey}`;
};
exports.KeychainService = {
    async save(identity, authToken) {
        if (!authToken || !authToken.trim()) {
            return;
        }
        await keytar_1.default.setPassword(SERVICE_NAME, buildAccount(identity), authToken);
    },
    async load(identity) {
        return keytar_1.default.getPassword(SERVICE_NAME, buildAccount(identity));
    },
    async clear(identity) {
        await keytar_1.default.deletePassword(SERVICE_NAME, buildAccount(identity));
    }
};
exports.default = exports.KeychainService;
