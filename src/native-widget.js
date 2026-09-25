import { Capacitor, registerPlugin } from '@capacitor/core';
import { widgetData, widgetTarget } from './widget-data.js';

const widget = Capacitor.isNativePlatform() ? registerPlugin('TimingWidget') : null;
export function refreshWidget(state, today) {
  if (!widget) return;
  // A later snapshot must win even if an earlier native write is still pending.
  pending = pending.then(() => widget.update({data:JSON.stringify(widgetData(state, today))}))
    .catch(error => console.error('Could not update Timing widget:', error));
}
let pending = Promise.resolve();

// Homework ticked off on a widget is held natively until the app collects it.
export async function takeWidgetCompletions() {
  if (!widget) return [];
  try { return (await widget.takeCompleted()).ids ?? []; }
  catch (error) { console.error('Could not read widget check-offs:', error); return []; }
}

// Widget taps open the app on a timing:// link; the plugin keeps the last one
// until a listener is attached, so a cold start is not lost.
export function onWidgetOpen(handler) {
  if (!widget) return;
  widget.addListener('open', event => {
    const target = widgetTarget(event?.url);
    if (target) handler(target);
  }).catch(error => console.error('Could not listen for widget taps:', error));
}
