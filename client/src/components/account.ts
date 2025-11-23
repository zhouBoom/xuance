export type AccountStatus = 'working' | 'idle' | 'offline' | 'init' | 'working-exception' | 'idle-exception';
export const ACCOUNT_STATUS = {
  WORKING: 'working',
  IDLE: 'idle',
  OFFLINE: 'offline',
  INIT: 'init',
  WORKING_EXCEPTION: 'working-exception',
  IDLE_EXCEPTION: 'idle-exception'
}
export const STATUS_CONFIG = {
  [ACCOUNT_STATUS.WORKING]: {
    color: '#2196F3', // 蓝色
    loading: true,
    label: '工作中'
  },
  [ACCOUNT_STATUS.IDLE]: {
    color: '#4CAF50', // 绿色
    loading: false,
    label: '在线'
  },
  [ACCOUNT_STATUS.OFFLINE]: {
    color: '#9E9E9E', // 灰色
    loading: false,
    label: '离线'
  },
  [ACCOUNT_STATUS.INIT]: {
    color: '#2196F3', // 蓝色
    loading: true,
    label: '准备'
  },
  [ACCOUNT_STATUS.WORKING_EXCEPTION]: {
    color: '#F44336', // 红色
    loading: false,
    label: '异常'
  },
  [ACCOUNT_STATUS.IDLE_EXCEPTION]: {
    color: '#F44336', // 橙色
    loading: false,
    label: '异常'
  }
} as const; 