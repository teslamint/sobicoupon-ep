# Current Codebase Status - August 2025

## Project Overview
Korean store locator application for Eunpyeong-gu consumption coupon merchants using Kakao Maps API.

## Technology Stack
- **Frontend**: ES6 modules, responsive web design
- **Backend**: Cloudflare Workers (serverless)
- **APIs**: Kakao Maps API, Places API
- **Storage**: IndexedDB (client caching)
- **Data Processing**: Excel parsing (XLSX.js)
- **Testing**: Jest with coverage reports

## Current Branch Status
- **Current branch**: v2
- **Main branch**: main
- **Recent commits**: Focus on marker event handling and UI fixes

## Core Modules Architecture

### 1. searchManager.js
**Purpose**: Orchestrates all search operations
**Key Methods**:
- `searchInCurrentMap()`: Main map area search
- `showSearchResult()`: Displays search results maintaining full list
- `showSingleStoreLocation()`: Individual store display (preserves full list)
- `toggleDistanceSort()`: Distance-based sorting with UI updates
- `applySorting()`: Generic sorting with performance optimizations

**Recent Changes**:
- Performance optimization: O(n²) → O(n) using Map-based lookups
- Enhanced data structure handling for nested/flat store objects
- Added comprehensive error handling with fallback mechanisms
- Fixed sorting stability issues (Infinity comparison)

### 2. uiManager.js
**Purpose**: Handles all UI updates and user interactions
**Key Methods**:
- `updateTable()`: Renders store list table
- `handleStoreClick()`: Individual store click handling
- `toggleDistanceHeader()`: Distance column visibility management
- `updateFilterOptions()`: Category and district filter updates

**Recent Changes**:
- Modified to use new `showSingleStoreLocation()` for individual clicks
- Improved distance header state preservation
- Enhanced XSS protection with safe DOM creation

### 3. stateManager.js
**Purpose**: Centralized application state management
**Key State Properties**:
- `stores`: Full store dataset
- `filteredStores`: Currently displayed stores
- `searchResults`: Latest search results
- `sortField`/`sortDirection`: Current sorting state
- `userLocation`: Current user position

### 4. mapManager.js
**Purpose**: Kakao Maps API integration and marker management
**Key Features**:
- Marker clustering and grouping
- Search result visualization
- User location handling
- Map bounds management

### 5. storageManager.js
**Purpose**: IndexedDB caching and data persistence
**Key Features**:
- Location data caching
- Category information storage
- Migration support for legacy data
- Batch operations for performance

## Current Functionality Status

### ✅ Working Features
1. **Excel file upload and parsing**
2. **Map-based store search with distance calculation**
3. **Distance-based sorting with proper UI updates**
4. **Individual store location search preserving full list**
5. **Category and district filtering**
6. **IndexedDB caching with migration support**
7. **Responsive mobile interface**
8. **Export functionality (CSV/JSON)**

### 🔧 Recent Fixes Applied
1. **Distance header sorting**: Fixed UI update issues
2. **Search result display**: Proper data structure mapping
3. **Individual store clicks**: Preserve full list instead of resetting
4. **Performance optimization**: Map-based lookups, memory optimization
5. **Error handling**: Comprehensive fallback mechanisms
6. **Type safety**: Distance value validation and sorting stability

## Build Process
- **Build command**: `npm run build`
- **Build tool**: Custom build.js script
- **Output**: `dist/` directory with bundled modules
- **Frontend**: esbuild for JavaScript bundling
- **Backend**: Workers build for Cloudflare deployment

## Known Architectural Patterns
1. **Module Pattern**: ES6 modules with singleton exports
2. **State Management**: Centralized with stateManager
3. **Event-Driven**: UI interactions trigger state updates
4. **Caching Strategy**: IndexedDB for offline capability
5. **Error Handling**: Graceful degradation with user notifications

## Development Workflow
1. Make changes to `public/` source files
2. Run `npm run build` to compile to `dist/`
3. Test functionality in browser
4. Commit changes with Korean commit messages
5. Use specialized AI agents for different areas:
   - `@frontend-developer`: UI/UX improvements
   - `@backend-developer`: Data processing and APIs
   - `@performance-optimizer`: Speed and memory optimization
   - `@code-reviewer`: Quality assurance

## Current Stability
The application is in a stable state with all major search functionality working correctly. Recent fixes have significantly improved performance and reliability, particularly around data structure handling and state management.