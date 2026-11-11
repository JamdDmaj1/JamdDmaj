import {openTradeShareDialog} from './lib/trade-share-dialog.js';

globalThis.JamdShare = {
  open(options) { return openTradeShareDialog(options); }
};
