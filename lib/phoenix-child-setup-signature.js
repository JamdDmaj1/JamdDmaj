// Exact, simulated setup signature capture. No custody or broadcast API.
import {requirePhoenixChildSetupWire,requirePhoenixChildSetupSimulation} from './phoenix-child-setup-simulation.js';
import {verifyPhoenixChildSetupSignature} from './phoenix-child-setup-stored.js';
export function capturePhoenixChildSetupSignature(wire,simulation,encoded,{request}={}){
 const p=requirePhoenixChildSetupWire(wire);requirePhoenixChildSetupSimulation(simulation,{wire,request});
 if(p.request!==request)throw Error('PHOENIX_CHILD_SIGNATURE_REJECTED');
 const archive=Object.freeze({wire,setup:p.setup}),signed=verifyPhoenixChildSetupSignature(archive,encoded);
 return Object.freeze({signature:signed.signature,serializedTxBase64:encoded,archive});
}
