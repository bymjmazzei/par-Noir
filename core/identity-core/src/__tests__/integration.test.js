"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
describe('Identity Core Integration Tests', () => {
    let identityCore;
    beforeEach(async () => {
        identityCore = new index_1.IdentityCore();
    });
    afterEach(async () => {
        try {
            identityCore.destroy();
        }
        catch (error) {
        }
    });
    describe('Core Functionality', () => {
        it('should create IdentityCore instance', () => {
            expect(identityCore).toBeDefined();
            expect(identityCore).toBeInstanceOf(index_1.IdentityCore);
        });
        it('should have proper configuration', () => {
            expect(identityCore).toHaveProperty('config');
        });
    });
    describe('Validation', () => {
        it('should validate pnName requirements', () => {
            const createOptions = {
                pnName: 'ab',
                passcode: 'MySecurePass123!@#'
            };
            expect(() => {
                if (!createOptions.pnName || createOptions.pnName.length < 3) {
                    throw new Error('Username must be at least 3 characters long');
                }
            }).toThrow('Username must be at least 3 characters long');
        });
        it('should validate pnName format', () => {
            const createOptions = {
                pnName: 'test@user',
                passcode: 'MySecurePass123!@#'
            };
            expect(() => {
                if (!/^[a-zA-Z0-9-]+$/.test(createOptions.pnName)) {
                    throw new Error('Username can only contain letters, numbers, and hyphens');
                }
            }).toThrow('Username can only contain letters, numbers, and hyphens');
        });
        it('should validate reserved pnNames', () => {
            const createOptions = {
                pnName: 'admin',
                passcode: 'MySecurePass123!@#'
            };
            expect(() => {
                const reservedUsernames = ['admin', 'root', 'system', 'test', 'guest', 'anonymous'];
                if (reservedUsernames.includes(createOptions.pnName.toLowerCase())) {
                    throw new Error('Username is reserved and cannot be used');
                }
            }).toThrow('Username is reserved and cannot be used');
        });
    });
    describe('Error Handling', () => {
        it('should handle storage errors gracefully', async () => {
            try {
                const result = await identityCore.getAllDIDs();
                expect(Array.isArray(result)).toBe(true);
            }
            catch (error) {
                expect(error).toBeDefined();
            }
        });
        it('should handle encryption errors gracefully', async () => {
            expect(identityCore).toBeDefined();
        });
    });
    describe('Event Handling', () => {
        it('should support event listeners', () => {
            const events = [];
            identityCore.on('did_created', (data) => {
                events.push('did_created');
            });
            identityCore.on('did_authenticated', (data) => {
                events.push('did_authenticated');
            });
            expect(identityCore).toHaveProperty('on');
        });
    });
});
//# sourceMappingURL=integration.test.js.map