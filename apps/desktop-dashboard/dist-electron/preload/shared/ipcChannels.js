"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NATIVE_IPC_CHANNEL = exports.SECURE_VOLUME_IPC_CHANNEL = void 0;
exports.SECURE_VOLUME_IPC_CHANNEL = {
    mount: 'secure-volume:mount',
    unmount: 'secure-volume:unmount',
    status: 'secure-volume:status',
    unlock: 'secure-volume:unlock',
    lock: 'secure-volume:lock'
};
exports.NATIVE_IPC_CHANNEL = {
    openPath: 'native:open-path'
};
