import { Capacitor, registerPlugin } from '@capacitor/core';
import { widgetData } from './widget-data.js';

const widget = Capacitor.isNativePlatform() ? registerPlugin('TimingWidget') : null;
export function refreshWidget(state, today) {
  if (!widget) return;
  // A later snapshot must win even if an earlier native write is still pending.
  pending = pending.then(() => widget.update({data:JSON.stringify(widgetData(state, today))}))
    .catch(error => console.error('Could not update Timing widget:', error));
}
let pending = Promise.resolve();
