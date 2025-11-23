interface LoggerInterface {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  silly: (...args: any[]) => void;
}

declare global {
  var Logger: LoggerInterface;
}

export {}; 