// dump timeline constants + typed-character times so the audio score shares the picture's clock
import { T, INTRO, TYPE_DT, events } from '../src/timeline.js';
console.log(JSON.stringify({ T, events: events(), introEnd: INTRO.map(l => l.times[l.times.length - 1]) }));
