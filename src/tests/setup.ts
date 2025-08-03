import 'fake-indexeddb/auto';

// Set up fake-indexeddb for all tests
// This provides IndexedDB support in the Node.js test environment

// Mock any other browser APIs that might be needed for tests
global.structuredClone = global.structuredClone || ((value: any) => JSON.parse(JSON.stringify(value)));

// Initialize the database with the latest schema once before all tests
beforeAll(async () => {
  try {
    // Import the initDb function and call it to ensure the database is created with the latest schema
    const { initDb } = await import('../lib/db');
    await initDb();
    console.log('✅ Database initialized with latest schema for tests');
  } catch (error) {
    console.error('❌ Failed to initialize database for tests:', error);
    throw error;
  }
});

// Optional: Add any additional test environment setup here
console.log('✅ Test environment setup complete with IndexedDB support'); 