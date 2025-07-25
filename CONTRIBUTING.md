# Contributing to BlobKit

Thank you for your interest in contributing to BlobKit! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please report any unacceptable behavior to the maintainers.

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn package manager
- Git

### Setting Up Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/blobkit.git
   cd blobkit
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a `.env` file for testing:
   ```bash
   cp .env.example .env
   # Edit .env with your test configuration
   ```

5. Run tests to ensure everything works:
   ```bash
   npm test
   ```

## Development Workflow

### Before Making Changes

1. Create a new branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Ensure all tests pass:
   ```bash
   npm test
   ```

3. Check code quality:
   ```bash
   npm run lint
   npm run typecheck
   ```

### Making Changes

1. **Follow TypeScript best practices**
   - Use strict typing
   - Add JSDoc comments for public APIs
   - Follow existing code patterns

2. **Write tests for new functionality**
   - Unit tests for all new functions
   - Integration tests for API changes
   - Maintain or improve test coverage

3. **Follow security practices**
   - Validate all inputs
   - Use structured error handling
   - Never hardcode sensitive information

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Use meaningful variable and function names
- Add comprehensive error handling
- Document complex algorithms or cryptographic operations

### Commit Guidelines

Use conventional commit messages:

```
type(scope): description

feat(kzg): add new KZG proof verification
fix(blob): resolve encoding issue with large data
docs(readme): update installation instructions
test(utils): add edge cases for blob validation
```

Types:
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `test`: Test additions or fixes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- blob.test.ts
```

### Writing Tests

- Place tests in the `test/` directory
- Mirror the source structure in test organization
- Test both success and failure cases
- Include edge cases and boundary conditions
- Mock external dependencies appropriately

### Test Categories

1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test component interactions
3. **Edge Case Tests**: Test boundary conditions and error cases
4. **Performance Tests**: Verify performance characteristics (disabled by default)

## Documentation

### Code Documentation

- Add JSDoc comments to all public APIs
- Include parameter descriptions and examples
- Document error conditions and return types
- Explain complex algorithms or cryptographic operations

### README Updates

- Update feature lists for new functionality
- Add new configuration options
- Include new usage examples
- Update API reference sections

## Security

### Reporting Security Issues

Do not open public issues for security vulnerabilities. Instead:

1. Email security concerns to the maintainers
2. Include detailed reproduction steps
3. Provide potential fix suggestions if available

### Security Guidelines

- Validate all user inputs
- Use parameterized queries and safe APIs
- Never log sensitive information
- Follow cryptographic best practices
- Use audited libraries for cryptographic operations

## Performance

### Performance Considerations

- Optimize for memory efficiency
- Use zero-copy operations where possible
- Pre-allocate buffers for known sizes
- Avoid unnecessary object creation in hot paths
- Profile performance-critical code paths

### Benchmarking

- Add benchmarks for new performance-critical features
- Ensure changes don't regress existing performance
- Document performance characteristics

## Pull Request Process

### Before Submitting

1. Ensure all tests pass
2. Run the full lint and type check suite
3. Update documentation if needed
4. Add changelog entries for significant changes

### Pull Request Requirements

1. **Clear Description**
   - Explain what the PR does
   - Reference related issues
   - Include screenshots for UI changes

2. **Code Quality**
   - All tests pass
   - No linting errors
   - Type checking passes
   - Good test coverage

3. **Documentation**
   - Update relevant documentation
   - Add JSDoc for new public APIs
   - Update changelog if appropriate

### Review Process

1. Maintainers will review your PR
2. Address feedback and requested changes
3. Ensure CI checks pass
4. PR will be merged after approval

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create release notes
4. Tag the release
5. Publish to npm

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions for questions about implementation
- Contact maintainers for security concerns

## Recognition

Contributors will be recognized in:
- Release notes for significant contributions
- Project documentation
- Special thanks for major features or fixes

Thank you for contributing to BlobKit! 