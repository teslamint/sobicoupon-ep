# Distance Sorting Bug Fixes

## Issues Resolved

### 1. Distance Header Click Not Working
**Problem**: Distance header clicks showed console message "거리순 정렬: 가까운 순" but UI table was not updating.

**Root Cause**: 
- `applySorting` method was calling `this.resultProcessor.getLastResults()` instead of getting current search results from state
- `uiManager.updateTable()` doesn't accept parameters - it reads from state, but `applySorting` was trying to pass sorted data directly

**Solution**:
```javascript
// Fixed in searchManager.js applySorting method
const state = stateManager.getState();
const results = state.searchResults || [];
// ... sorting logic ...
stateManager.setState({ filteredStores: sortedStoresForTable });
uiManager.updateTable(); // No parameters - reads from state
```

### 2. Individual Store Click Not Showing Distance
**Problem**: When clicking individual stores, distance information was not calculated or displayed.

**Solution**: Added distance calculation in `showSearchResult` method:
```javascript
// Added in showSearchResult method
results = this.resultProcessor.calculateDistanceFromUserLocation(results);
```

### 3. Distance Calculation Missing in Search Results
**Problem**: Search results had `distance: null` even when user location was available.

**Solution**: Added `calculateDistanceFromUserLocation` method to SearchResultProcessor and integrated it into the search workflow.

### 4. Distance Header Validation Issues
**Problem**: `hasDistanceInResults` was checking for `!== undefined` but not `!== null` and `!== ''`.

**Solution**: Enhanced validation logic:
```javascript
const hasDistanceInResults = searchResults.some(result => {
    return (result.distance !== undefined && result.distance !== null && result.distance !== '') ||
           (result.store && result.store.거리 !== undefined && result.store.거리 !== null && result.store.거리 !== '');
});
```

## Current Issues Being Fixed

### 1. Search Results Not Auto-Sorted by Distance
**Problem**: After "현 지도에서 검색", results are not automatically sorted by distance.

**Solution Applied**: Modified `showSearchResult` to update `filteredStores` state with distance-sorted results:
```javascript
stateManager.setState({ filteredStores: sortedStoresForTable });
uiManager.updateTable();
```

### 2. Distance Header Toggle Not Working
**Problem**: Clicking distance header always shows "가까운 순" - direction toggle not working.

**Debug Added**: Added logging to track current sort state and new direction:
```javascript
console.log('현재 정렬 상태:', { currentSortField, currentSortDirection });
console.log('새로운 정렬 방향:', newDirection);
```

## Key Files Modified

1. **public/modules/searchManager.js**:
   - `applySorting()`: Fixed to use state instead of resultProcessor.getLastResults()
   - `showSearchResult()`: Added distance calculation and proper state updates
   - `toggleDistanceSort()`: Enhanced validation and added debugging

2. **public/modules/search/searchResultProcessor.js**:
   - Added `calculateDistanceFromUserLocation()` method
   - Integrated distance calculation into `processResults()` workflow

3. **public/modules/mapManager.js**:
   - Added `getCurrentLocation()` method to return stored user location

## Testing Workflow

1. Click "현재위치 보기" (sets user location)
2. Click "현 지도에서 검색" (should auto-sort by distance)  
3. Click distance header (should toggle between asc/desc)
4. Click individual stores (should show distance info)

## Technical Notes

- Distance calculation requires user location to be set first via "현재위치 보기"
- UI table updates work through state management - don't pass data directly to updateTable()
- Distance sorting validation checks multiple data sources for robustness
- All distance values stored as numbers (meters) for consistent sorting