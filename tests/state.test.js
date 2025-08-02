import { StateManager } from '../public/modules/state.js';

describe('StateManager', () => {
    let stateManager;

    beforeEach(() => {
        stateManager = new StateManager();
    });

    describe('setState and getState', () => {
        test('should update state correctly', () => {
            stateManager.setState({ searchQuery: 'test' });
            expect(stateManager.getState('searchQuery')).toBe('test');
        });

        test('should update multiple properties', () => {
            stateManager.setState({
                searchQuery: 'test',
                currentPage: 2,
                pageSize: 50
            });

            expect(stateManager.getState('searchQuery')).toBe('test');
            expect(stateManager.getState('currentPage')).toBe(2);
            expect(stateManager.getState('pageSize')).toBe(50);
        });

        test('should return entire state when no key provided', () => {
            const state = stateManager.getState();
            expect(state).toHaveProperty('stores');
            expect(state).toHaveProperty('filteredStores');
            expect(state).toHaveProperty('currentPage');
        });
    });

    describe('subscribe', () => {
        test('should notify observers on state change', () => {
            const mockCallback = jest.fn();

            stateManager.subscribe('searchQuery', mockCallback);
            stateManager.setState({ searchQuery: 'test' });

            expect(mockCallback).toHaveBeenCalledWith('test', 'searchQuery');
        });

        test('should not notify for unchanged values', () => {
            const mockCallback = jest.fn();

            stateManager.setState({ searchQuery: 'initial' });
            stateManager.subscribe('searchQuery', mockCallback);
            stateManager.setState({ searchQuery: 'initial' });

            expect(mockCallback).not.toHaveBeenCalled();
        });

        test('should handle unsubscribe', () => {
            const mockCallback = jest.fn();

            const unsubscribe = stateManager.subscribe('searchQuery', mockCallback);
            stateManager.setState({ searchQuery: 'test1' });

            expect(mockCallback).toHaveBeenCalledTimes(1);

            unsubscribe();
            stateManager.setState({ searchQuery: 'test2' });

            expect(mockCallback).toHaveBeenCalledTimes(1);
        });
    });

    describe('resetState', () => {
        test('should reset specific keys', () => {
            stateManager.setState({
                searchQuery: 'test',
                currentPage: 5
            });

            stateManager.resetState(['searchQuery']);

            expect(stateManager.getState('searchQuery')).toBe('');
            expect(stateManager.getState('currentPage')).toBe(5);
        });

        test('should reset entire state when no keys provided', () => {
            stateManager.setState({
                searchQuery: 'test',
                currentPage: 5,
                pageSize: 100
            });

            stateManager.resetState();

            expect(stateManager.getState('searchQuery')).toBe('');
            expect(stateManager.getState('currentPage')).toBe(1);
            expect(stateManager.getState('pageSize')).toBe(25);
        });
    });

    describe('computed state', () => {
        test('should calculate paginated stores correctly', () => {
            const mockStores = Array.from({ length: 100 }, (_, i) => ({
                상호: `Store ${i}`,
                읍면동명: `동 ${i % 10}`
            }));

            stateManager.setState({
                filteredStores: mockStores,
                currentPage: 2,
                pageSize: 25
            });

            const computed = stateManager.getComputedState();

            expect(computed.paginatedStores).toHaveLength(25);
            expect(computed.paginatedStores[0].상호).toBe('Store 25');
            expect(computed.totalPages).toBe(4);
            expect(computed.startIndex).toBe(25);
            expect(computed.endIndex).toBe(50);
        });

        test('should handle sorting', () => {
            const mockStores = [
                { 상호: 'C Store', 읍면동명: '불광동' },
                { 상호: 'A Store', 읍면동명: '녹번동' },
                { 상호: 'B Store', 읍면동명: '역촌동' }
            ];

            stateManager.setState({
                filteredStores: mockStores,
                sortField: '상호',
                sortDirection: 'asc'
            });

            const computed = stateManager.getComputedState();

            expect(computed.sortedStores[0].상호).toBe('A Store');
            expect(computed.sortedStores[1].상호).toBe('B Store');
            expect(computed.sortedStores[2].상호).toBe('C Store');
        });
    });

    describe('history', () => {
        test('should track state changes', () => {
            stateManager.setState({ searchQuery: 'test1' });
            stateManager.setState({ searchQuery: 'test2' });

            expect(stateManager.history).toHaveLength(2);
            expect(stateManager.history[0].changedKeys).toContain('searchQuery');
        });

        test('should undo state changes', () => {
            stateManager.setState({ searchQuery: 'test1' });
            stateManager.setState({ searchQuery: 'test2' });

            const undone = stateManager.undo();

            expect(undone).toBe(true);
            expect(stateManager.getState('searchQuery')).toBe('test1');
        });

        test('should limit history size', () => {
            // 기본 maxHistorySize는 50
            for (let i = 0; i < 60; i++) {
                stateManager.setState({ searchQuery: `test${i}` });
            }

            expect(stateManager.history.length).toBeLessThanOrEqual(50);
        });
    });

    describe('serialization', () => {
        test('should serialize and deserialize state', () => {
            stateManager.setState({
                stores: [{ 상호: 'Test Store' }],
                searchQuery: 'test',
                selectedCategories: new Set(['CS2', 'FD6'])
            });

            const serialized = stateManager.serialize();
            const newStateManager = new StateManager();
            const deserialized = newStateManager.deserialize(serialized);

            expect(deserialized).toBe(true);
            expect(newStateManager.getState('searchQuery')).toBe('test');
            expect(newStateManager.getState('stores')).toHaveLength(1);
            expect(newStateManager.getState('selectedCategories').has('CS2')).toBe(true);
        });

        test('should handle invalid JSON gracefully', () => {
            const newStateManager = new StateManager();
            const result = newStateManager.deserialize('invalid json');

            expect(result).toBe(false);
        });
    });
});
