const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/browser-app.js',
  output: {
    filename: 'blobkit-app.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'BlobKitApp',
    libraryTarget: 'umd'
  },
  resolve: {
    extensions: ['.js', '.ts'],
    fallback: {
      // Exclude Node.js built-ins
      fs: false,
      'fs/promises': false,
      path: false,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    // Add any plugins here
  ],
  optimization: {
    minimize: true,
    // Enable tree shaking
    usedExports: true,
    sideEffects: false
  }
};