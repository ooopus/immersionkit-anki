/**
 * State Management Module
 * 
 * Provides a generic StateManager class for managing application state
 * with typed state objects and event subscriptions.
 */

/**
 * Generic state manager with subscription support.
 * @template T - The state object type
 */
export class StateManager<T extends object> {
  private state: T;
  private listeners: Set<(state: T) => void> = new Set();

  constructor(initialState: T) {
    this.state = { ...initialState };
  }

  /**
   * Get a shallow copy of the current state.
   */
  getState(): T {
    return { ...this.state };
  }

  /**
   * Update state with partial values and notify subscribers.
   */
  setState(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  /**
   * Subscribe to state changes.
   * @returns Unsubscribe function
   */
  subscribe(fn: (state: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Notify all subscribers of state change.
   */
  private notifyListeners(): void {
    const currentState = this.getState();
    for (const fn of this.listeners) {
      try {
        fn(currentState);
      } catch (e) {
        console.error('[StateManager] Listener error:', e);
      }
    }
  }
}
