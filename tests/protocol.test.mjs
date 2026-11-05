import { DroneLinkMsg } from '../public/modules/droneLinkMsg.mjs';
import { registerCodecTests } from '@dronelink/protocol/testing';
registerCodecTests(DroneLinkMsg, 'gateway');
