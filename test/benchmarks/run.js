const { performance } = require('perf_hooks');
const { initializeForDevelopment } = require('../../dist/init');
const { encodeBlob, decodeBlob } = require('../../dist/blob/utils');

async function runBenchmarks() {
  console.log('🏃 Running BlobKit Performance Benchmarks\n');
  
  await initializeForDevelopment();
  
  // Test data of various sizes
  const testSizes = [1024, 10240, 102400, 1024000]; // 1KB, 10KB, 100KB, 1MB
  
  for (const size of testSizes) {
    console.log(`📊 Testing ${size} bytes data...`);
    
    // Generate test data
    const testData = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      testData[i] = i % 256;
    }
    
    // Benchmark encoding
    const encodeStart = performance.now();
    const encoded = encodeBlob(testData, true);
    const encodeEnd = performance.now();
    
    // Benchmark decoding
    const decodeStart = performance.now();
    const decoded = decodeBlob(encoded, true);
    const decodeEnd = performance.now();
    
    // Verify correctness
    const isCorrect = testData.every((byte, i) => byte === decoded[i]);
    
    console.log(`  ✅ Encode: ${(encodeEnd - encodeStart).toFixed(2)}ms`);
    console.log(`  ✅ Decode: ${(decodeEnd - decodeStart).toFixed(2)}ms`);
    console.log(`  ✅ Compression ratio: ${((1 - encoded.length / (4096 * 32)) * 100).toFixed(1)}%`);
    console.log(`  ✅ Data integrity: ${isCorrect ? 'PASS' : 'FAIL'}`);
    console.log('');
  }
  
  console.log('🎉 Benchmarks completed successfully!');
}

runBenchmarks().catch(console.error);
