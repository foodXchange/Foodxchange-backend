# Contributing to FoodXchange Backend

First off, thank you for considering contributing to FoodXchange! It's people like you that make FoodXchange such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by the [FoodXchange Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible using our issue template.

**Great Bug Reports** tend to have:
- A quick summary and/or background
- Steps to reproduce
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:
- A clear and descriptive title
- A detailed description of the proposed enhancement
- Examples of how the enhancement would be used
- Why this enhancement would be useful

### Your First Code Contribution

Unsure where to begin contributing? You can start by looking through these issues:
- `good first issue` - issues which should only require a few lines of code
- `help wanted` - issues which should be a bit more involved than beginner issues

### Pull Requests

1. Fork the repo and create your branch from `develop`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Process

### Branch Naming

- `feature/` - New features (e.g., `feature/add-payment-processing`)
- `fix/` - Bug fixes (e.g., `fix/order-calculation-error`)
- `docs/` - Documentation changes (e.g., `docs/update-api-endpoints`)
- `refactor/` - Code refactoring (e.g., `refactor/optimize-database-queries`)
- `test/` - Test additions or changes (e.g., `test/add-auth-integration-tests`)

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect code meaning
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Examples:
```
feat(auth): add OAuth2 authentication support

- Implement Google OAuth2 provider
- Add Facebook OAuth2 provider
- Update user model to support OAuth profiles

Closes #123
```

### Code Style

- Use TypeScript for all new code
- Follow the existing code style (enforced by ESLint)
- Use meaningful variable and function names
- Comment complex logic
- Keep functions small and focused
- Write tests for new features

### Testing

- Write unit tests for all business logic
- Write integration tests for API endpoints
- Aim for >80% code coverage
- Run tests before submitting PR: `npm test`

### Documentation

- Update README.md if needed
- Update API documentation for endpoint changes
- Add JSDoc comments for public functions
- Update type definitions

## Setting Up Development Environment

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/Foodxchange-backend.git
   cd Foodxchange-backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start Development**
   ```bash
   npm run dev
   ```

5. **Run Tests**
   ```bash
   npm test
   ```

## Project Structure

```
src/
├── controllers/     # Request handlers
├── services/       # Business logic
├── models/         # Database models
├── routes/         # API routes
├── middleware/     # Express middleware
├── utils/          # Utility functions
├── types/          # TypeScript types
└── core/           # Core infrastructure
```

## Review Process

1. A team member will review your PR
2. They may request changes or ask questions
3. Make requested changes and push to your branch
4. Once approved, your PR will be merged

## Community

- Join our [Discord](https://discord.gg/foodxchange)
- Follow us on [Twitter](https://twitter.com/foodxchange)
- Read our [blog](https://blog.foodxchange.com)

## Recognition

Contributors will be recognized in:
- Our README.md contributors section
- Release notes
- Our website's contributors page

Thank you for contributing! 🎉