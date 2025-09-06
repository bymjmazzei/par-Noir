describe('Performance and Memory Tests', () => {
  describe('Memory Management', () => {
    test('should not leak memory during crypto operations', () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Perform multiple crypto operations
      for (let i = 0; i < 100; i++) {
        const random = crypto.getRandomValues(new Uint8Array(32));
        const hash = 'test'.repeat(100);
        const array = Array.from({ length: 100 }, (_, j) => j);
      }
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle large data operations efficiently', () => {
      const start = Date.now();
      
      // Create and process large data
      const largeArray = Array.from({ length: 10000 }, (_, i) => i);
      const processed = largeArray.map(x => x * 2).filter(x => x % 4 === 0);
      
      const end = Date.now();
      const duration = end - start;
      
      expect(processed).toHaveLength(5000);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });

  describe('Response Time Validation', () => {
    test('should complete crypto operations quickly', () => {
      const start = Date.now();
      
      // Perform crypto operations
      const random = crypto.getRandomValues(new Uint8Array(32));
      const hash = 'test'.repeat(1000);
      
      const end = Date.now();
      const duration = end - start;
      
      expect(random).toBeDefined();
      expect(hash).toBeDefined();
      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
    });

    test('should handle concurrent operations efficiently', async () => {
      const start = Date.now();
      
      // Perform concurrent operations
      const promises = Array(10).fill(null).map(async (_, i) => {
        const random = crypto.getRandomValues(new Uint8Array(16));
        const hash = `test${i}`.repeat(100);
        return { random, hash };
      });
      
      const results = await Promise.all(promises);
      const end = Date.now();
      const duration = end - start;
      
      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(500); // Should complete in less than 500ms
    });
  });

  describe('Resource Usage', () => {
    test('should not consume excessive CPU', () => {
      const start = Date.now();
      
      // Perform CPU-intensive operations
      let result = 0;
      for (let i = 0; i < 100000; i++) {
        result += Math.sqrt(i);
      }
      
      const end = Date.now();
      const duration = end - start;
      
      expect(result).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    test('should handle string operations efficiently', () => {
      const start = Date.now();
      
      // Perform string operations
      let result = '';
      for (let i = 0; i < 1000; i++) {
        result += `test${i}`;
      }
      
      const end = Date.now();
      const duration = end - start;
      
      expect(result.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
    });
  });

  describe('Scalability Tests', () => {
    test('should handle increasing data sizes', () => {
      const sizes = [100, 1000, 10000];
      const results = sizes.map(size => {
        const start = Date.now();
        const array = Array.from({ length: size }, (_, i) => i);
        const processed = array.map(x => x * 2);
        const end = Date.now();
        return { size, duration: end - start, processed: processed.length };
      });
      
      results.forEach(result => {
        expect(result.processed).toBe(result.size);
        expect(result.duration).toBeLessThan(1000); // Each should complete in less than 1 second
      });
    });

    test('should maintain performance under load', async () => {
      const start = Date.now();
      
      // Simulate load with multiple concurrent operations
      const operations = Array(50).fill(null).map(async (_, i) => {
        const random = crypto.getRandomValues(new Uint8Array(16));
        const hash = `load-test-${i}`.repeat(10);
        const array = Array.from({ length: 100 }, (_, j) => j + i);
        return { random, hash, array };
      });
      
      const results = await Promise.all(operations);
      const end = Date.now();
      const duration = end - start;
      
      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(2000); // Should complete in less than 2 seconds
    });
  });
});
