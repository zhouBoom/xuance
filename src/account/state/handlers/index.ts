export interface StateHandler {
  handle(payload?: any): void;
}

export * from './InitHandler';
export * from './IdleStateHandler';
export * from './WorkingStateHandler';
export * from './WorkingExceptionHandler';
export * from './IdleExceptionHandler';
export * from './NotLoginedStateHandler'; 