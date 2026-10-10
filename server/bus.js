// Bus d'événements interne : tout ce qui doit remonter à l'interface passe par ici.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(100);
