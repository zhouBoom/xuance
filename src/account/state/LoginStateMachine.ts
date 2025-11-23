export enum LoginState {
  IDLE = 'IDLE', // 已登录，空闲
  WORKING = 'WORKING', // 已登录，工作中
  WORKING_EXCEPTION = 'WORKING_EXCEPTION', // 已登录，工作中异常
  IDLE_EXCEPTION = 'IDLE_EXCEPTION', // 已登录，空闲异常
  NOT_LOGINED = 'NOT_LOGINED', // 未登录
  INIT = 'INIT', // 初始化
}

interface StatePayload {
  [LoginState.IDLE]: {
    accountId: string;
    token: string;
    // 其他登录相关信息
  };
  [LoginState.WORKING]: {
    taskId: string;
    // 任务相关信息
  };
  [LoginState.WORKING_EXCEPTION]: {
    error: Error;
    message: string;
  };
  [LoginState.IDLE_EXCEPTION]: {
    error: Error;
    message: string;
  };
  [LoginState.INIT]: {
    // 初始化相关信息
  };
  [LoginState.NOT_LOGINED]: {
    // 未登录相关信息
  };
}

import { XuanceModule } from '../../types/xuance-module';
import {
  IdleStateHandler,
  WorkingStateHandler,
  WorkingExceptionHandler,
  IdleExceptionHandler,
  NotLoginedStateHandler,
  InitHandler,
} from './handlers';

class LoginStateMachine {
  private accountStates: Map<string, LoginState> = new Map();
  private handlers: Map<LoginState, Set<LoginState>> = new Map();
  private stateHandlers: Record<LoginState, any> = {
    [LoginState.IDLE]: new IdleStateHandler(),
    [LoginState.WORKING]: new WorkingStateHandler(),
    [LoginState.WORKING_EXCEPTION]: new WorkingExceptionHandler(),
    [LoginState.IDLE_EXCEPTION]: new IdleExceptionHandler(),
    [LoginState.NOT_LOGINED]: new NotLoginedStateHandler(),
    [LoginState.INIT]: new InitHandler(),
  };

  constructor() {
    this.initStateTransitions();
  }

  private initStateTransitions(): void {
    // 初始化所有状态的可能转换
    this.handlers.set(LoginState.INIT, new Set([
      LoginState.NOT_LOGINED,
      LoginState.IDLE,
      LoginState.INIT
    ]));
    
    this.handlers.set(LoginState.NOT_LOGINED, new Set([
      LoginState.IDLE,
      LoginState.INIT
    ]));
    
    this.handlers.set(LoginState.IDLE, new Set([
      LoginState.WORKING,
      LoginState.IDLE_EXCEPTION,
      LoginState.NOT_LOGINED
    ]));
    
    this.handlers.set(LoginState.WORKING, new Set([
      LoginState.IDLE,
      LoginState.WORKING_EXCEPTION,
      LoginState.NOT_LOGINED
    ]));
    
    this.handlers.set(LoginState.WORKING_EXCEPTION, new Set([
      LoginState.WORKING,
      LoginState.NOT_LOGINED,
      LoginState.IDLE,
      LoginState.IDLE_EXCEPTION
    ]));
    
    this.handlers.set(LoginState.IDLE_EXCEPTION, new Set([
      LoginState.IDLE,
      LoginState.NOT_LOGINED
    ]));
  }

  public dispatch<S extends LoginState>(
    nextState: S,
    payload?: StatePayload[S]
  ): boolean {
    const accountId = 'accountId' in payload ? payload.accountId : null;
    if (!accountId) {
      Logger.warn(XuanceModule.ACCOUNT.STATE.DISPATCH, null, '缺少accountId', {nextState});
      return false;
    }

    // 获取当前账号的状态，如果不存在则默认为INIT
    const currentState = this.accountStates.get(accountId) || LoginState.INIT;
    
    // 1. 验证状态转换是否合法
    const possibleStates = this.handlers.get(currentState);
    if (!possibleStates?.has(nextState)) {
      Logger.warn(XuanceModule.ACCOUNT.STATE.DISPATCH, accountId, '不允许的状态转换', {currentState, nextState});
      return false;
    }

    // 2. 执行状态转换
    Logger.info(XuanceModule.ACCOUNT.STATE.DISPATCH, accountId, '执行状态转换', {currentState, nextState});
    this.accountStates.set(accountId, nextState);

    // 3. 处理新状态的初始化
    this.handleState(nextState, payload);

    return true;
  }

  private handleState<S extends LoginState>(
    state: S,
    payload?: StatePayload[S]
  ) {
    const handler = this.stateHandlers[state];
    if (handler) {
      Logger.info(XuanceModule.ACCOUNT.STATE.DISPATCH, ('accountId' in payload ? payload.accountId : null) || '无效的accountId', 'handleState-start', {state, payload});
      handler.handle(payload);
      Logger.info(XuanceModule.ACCOUNT.STATE.DISPATCH, ('accountId' in payload ? payload.accountId : null) || '无效的accountId', 'handleState-end', {state, payload});
    }
  }

  public getCurrentState(accountId: string): LoginState {
    return this.accountStates.get(accountId) || LoginState.INIT;
  }

  public destroy(): void {
    // 清理所有状态和资源
    this.accountStates.clear();
    this.handlers.clear();
    // 清理其他资源...
  }
}
export { LoginStateMachine };