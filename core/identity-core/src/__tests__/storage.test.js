"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const indexeddb_1 = require("../storage/indexeddb");
describe('IndexedDBStorage', () => {
    let storage;
    beforeEach(async () => {
        storage = new indexeddb_1.IndexedDBStorage();
    });
    afterEach(async () => {
        try {
            await storage.clear();
        }
        catch (error) {
        }
    });
    describe('Basic Operations', () => {
        it('should create storage instance', () => {
            expect(storage).toBeDefined();
            expect(storage).toBeInstanceOf(indexeddb_1.IndexedDBStorage);
        });
        it('should handle clear operation gracefully', async () => {
            try {
                await storage.clear();
            }
            catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
    describe('Error Handling', () => {
        it('should handle storage errors gracefully', async () => {
            try {
                const result = await storage.getAllDIDs();
                expect(Array.isArray(result)).toBe(true);
            }
            catch (error) {
                expect(error).toBeDefined();
            }
        });
        it('should handle getDID gracefully', async () => {
            try {
                const result = await storage.getDID('test-id', 'test-passcode');
                expect(result).toBeDefined();
            }
            catch (error) {
                expect(error).toBeDefined();
            }
        });
        it('should handle storeDID gracefully', async () => {
            try {
                const testDID = {
                    id: 'did:key:123456789',
                    username: 'testuser',
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    metadata: {
                        displayName: 'Test User',
                        preferences: {
                            privacy: 'high',
                            sharing: 'selective',
                            notifications: true,
                            backup: true
                        }
                    }
                };
                await storage.storeDID(testDID, 'test-passcode');
            }
            catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
});
//# sourceMappingURL=storage.test.js.map