import { receiveQueue } from './receive';
import { sendQueue } from './send';
import { receiveDelayQueue } from './receiveDelay';
import { sendDelayQueue } from './sendDelay';

const initReceiveQueue = () => {
    // receiveQueue.init();
};
const initSendQueue = () => {
    sendQueue.init();
};
const initReceiveDelayQueue = () => {
    receiveDelayQueue.init();
};
const initSendDelayQueue = () => {
    sendDelayQueue.init();
}
const initQueue = () => {
  initReceiveQueue();
  initSendQueue();
  initReceiveDelayQueue();
  initSendDelayQueue();
};

export { initQueue };