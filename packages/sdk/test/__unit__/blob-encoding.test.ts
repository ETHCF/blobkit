import {
  encodeBlob,
  decodeBlob
} from '../../src/kzg';

import {
  generateTestBlobData
} from '../../../../test/utils';


describe('Blob Encoding tests', () => {
    test('decoding encoded data should generate the same as original', async () => {
      // Write a blob first
      const originalData = generateTestBlobData('random', 1000);

      // Decode and verify data matches
      // Note: The data will be encoded in blob format, so we need to decode it
      const encodedBlob = encodeBlob(originalData);
      const decodedBlob = decodeBlob(encodedBlob);
      expect(decodedBlob.length).toEqual(originalData.length);
      expect(decodedBlob).toEqual(originalData);
    });
})