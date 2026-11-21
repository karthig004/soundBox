/**
 * @format
 */

import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {headlessTask} from './src/engine/service';

// Fired by SoundboxListenerService for every payment-looking notification, even when the UI is closed.
AppRegistry.registerHeadlessTask('SoundboxEvent', () => headlessTask);
AppRegistry.registerComponent(appName, () => App);
