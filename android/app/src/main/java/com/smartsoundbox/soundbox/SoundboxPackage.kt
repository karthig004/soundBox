package com.smartsoundbox.soundbox

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SoundboxPackage : ReactPackage {
  override fun createNativeModules(rc: ReactApplicationContext): List<NativeModule> = listOf(SoundboxModule(rc), TranslatorModule(rc), SpeechInputModule(rc), ReminderModule(rc))
  override fun createViewManagers(rc: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
