# Code Style and Conventions

## ESLint Configuration
- **Indentation**: 4 spaces (not tabs)
- **Quotes**: Single quotes preferred
- **Semicolons**: Required
- **Line endings**: Unix (LF)
- **Brace style**: 1TBS (one true brace style)

## Prettier Configuration
- **Print width**: 100 characters
- **Tab width**: 4 spaces
- **Trailing commas**: None
- **Bracket spacing**: Enabled
- **Arrow parens**: Always

## Naming Conventions
- **Classes**: PascalCase (e.g., SearchManager, MapManager)
- **Methods/Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Variables**: camelCase
- **Module exports**: camelCase for instances, PascalCase for classes

## Code Organization Patterns
- Each module exports both a class and a singleton instance
- Error handling using custom AppError classes
- Async/await preferred over Promises
- ES6 modules with explicit imports/exports
- JSDoc comments for complex functions

## File Structure
- One class per file
- Utility functions grouped in utils.js
- Constants centralized in constants.js
- Error definitions in errors.js