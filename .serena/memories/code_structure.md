# Code Structure and Architecture

## Module Organization
The project follows ES6 module architecture with clear separation of concerns:

### Core Modules
- `searchManager.js` - Main search functionality (981 lines - NEEDS REFACTORING)
- `mapManager.js` - Kakao Maps integration and marker management
- `uiManager.js` - User interface and interaction handling
- `stateManager.js` - Application state management
- `storageManager.js` - IndexedDB caching and data persistence

### Utility Modules
- `fileHandler.js` - Excel file processing
- `utils.js` - Common utility functions
- `errors.js` - Error handling and custom error classes
- `constants.js` - Application constants
- `config.js` - Configuration management

### Special Modules
- `migration.js` - Cache migration functionality
- `recovery.js` - Data recovery mechanisms
- `search/` directory - Modularized search services

## Architecture Patterns
- **Singleton Pattern**: Used for managers (searchManager, mapManager, etc.)
- **Module Pattern**: ES6 modules with clear exports
- **Observer Pattern**: Event-driven state management
- **Strategy Pattern**: Different search algorithms for categories vs keywords

## Critical Refactoring Areas
1. **SearchManager** - 981 lines, needs decomposition
2. Large methods (>100 lines) requiring breakdown
3. Global function cleanup needed