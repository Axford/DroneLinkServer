import { SerialPort as RealPort } from 'serialport';
import { MockBinding } from '@serialport/binding-mock';

export const mockSerialPath = '/test/workbench-serial';
MockBinding.createPort(mockSerialPath, { record: true });
let current;

export class SerialPort extends RealPort {
  constructor(options) {
    super({ ...options, binding: MockBinding });
    current = this;
  }
}

process.on('message', async message => {
  if (message?.serial === 'detach' && current?.isOpen) {
    current.close(error => { if (error) throw error; });
  }
  if (message?.serial === 'data' && current?.isOpen) current.port.emitData(Buffer.from(message.bytes));
});
process.channel?.unref();
