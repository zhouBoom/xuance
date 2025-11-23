import { loginStateMachineManager } from './LoginStateMachineManager';
import { LoginState } from './LoginStateMachine';
import { XuanceModule } from '../../types/xuance-module';

export const initStateMachine = () => {
  loginStateMachineManager.init();
}
export const createStateMachine = (accountId: string) => {
  loginStateMachineManager.removeMachine(accountId);
  return loginStateMachineManager.getOrCreateMachine(accountId);
}
export const removeStateMachine = (accountId: string) => {
  loginStateMachineManager.removeMachine(accountId);
}
export const getStateMachine = (accountId: string) => {
  return loginStateMachineManager.getOrCreateMachine(accountId);
}
export const getAllStateMachines = () => {
  return loginStateMachineManager.getAllMachines();
}
export const clearAllStateMachines = () => {
  loginStateMachineManager.destroy();
}
export const dispatch = (accountId: string, state: LoginState, payload?: any) => {
  Logger.info(XuanceModule.ACCOUNT.STATE.DISPATCH, accountId, 'dispatch-start', {state, payload});
  const machine = getStateMachine(accountId);
  if (machine) {
    machine.dispatch(state, payload);
  }
  Logger.info(XuanceModule.ACCOUNT.STATE.DISPATCH, accountId, 'dispatch-end', {state, payload});
}