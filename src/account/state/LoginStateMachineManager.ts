import { LoginStateMachine } from './LoginStateMachine';

class LoginStateMachineManager {
  private machines: Map<string, LoginStateMachine> = new Map();

  // 获取或创建状态机
  public getOrCreateMachine(accountId: string): LoginStateMachine {
    if (!this.machines.has(accountId)) {
      const machine = new LoginStateMachine();
      this.machines.set(accountId, machine);
    }
    return this.machines.get(accountId)!;
  }

  // 移除状态机
  public removeMachine(accountId: string): void {
    this.machines.delete(accountId);
  }

  public getMachine(accountId: string): LoginStateMachine | undefined {
    return this.machines.get(accountId);
  }

  // 获取所有状态机
  public getAllMachines(): Map<string, LoginStateMachine> {
    return this.machines;
  }

  public destroy() {
    this.machines.clear();
  }

  public init() {
    // 初始化所有状态机
  }
} 

export const loginStateMachineManager = new LoginStateMachineManager();