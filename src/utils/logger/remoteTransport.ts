import Transport, { TransportStreamOptions } from 'winston-transport';
import axios, { AxiosRequestConfig } from 'axios';
import { getMd5 } from '../md5';

interface RemoteTransportOptions extends TransportStreamOptions {
  endpoint: string;
}

export class RemoteTransport extends Transport {
  private endpoint: string;

  constructor(opts: RemoteTransportOptions) {
    super(opts);
    this.endpoint = opts.endpoint;
  }

  log(info: any, callback: () => void): void {
    const timeStamp = Date.now();
    const params: AxiosRequestConfig = {
      method: 'post',
      url: this.endpoint,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'X-Log-Appid': '1005398',
        'X-Log-TimeStamp': timeStamp,
        'X-Log-Sign': getMd5(
          '1005398' + '&' + timeStamp + '3ab4715467ad7ce4233bec5a8ee177e2'
        ),
      },
      data: `content=[${JSON.stringify(info)}]`,
    };

    axios(params)
      .then((response) => {
        // console.log(response.data);
      })
      .catch((error) => {
        // console.error(error);
      });
    callback?.();
  }
}

export default RemoteTransport;
