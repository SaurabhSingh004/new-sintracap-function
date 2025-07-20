// File: shared/services/cacheService.js
const NodeCache = require('node-cache');

// Create cache instance
const cache = new NodeCache({
  stdTTL: 600, // Default TTL: 10 minutes
  checkperiod: 120 // Check for expired keys every 2 minutes
});

class CacheService {
  /**
   * Set a value in cache with optional TTL
   */
  static async set(key, value, ttl = 600) {
    return cache.set(key, value, ttl);
  }

  /**
   * Get a value from cache
   */
  static async get(key) {
    return cache.get(key);
  }

  /**
   * Delete a key from cache
   */
  static async del(key) {
    return cache.del(key);
  }
}

module.exports = CacheService;