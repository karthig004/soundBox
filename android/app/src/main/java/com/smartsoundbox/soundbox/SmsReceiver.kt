package com.smartsoundbox.soundbox

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import org.json.JSONObject

/**
 * "Verify SMS sender" mode. Reads incoming SMS directly, so the sender is the real originating
 * address (e.g. "JM-HDFCBK-S") — not a contact name or whatever the SMS app shows. Works with any
 * SMS app. Only money-looking messages are passed on; which senders count is decided in JS.
 */
class SmsReceiver : BroadcastReceiver() {

  companion object {
    private val MONEY = Regex(
        "(₹|rs\\.?\\s?\\d|inr\\s?\\d|rupees|credited|debited|रुपये|ரூபாய்)", RegexOption.IGNORE_CASE)
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    try {
      val prefs = SoundboxPrefs(context)
      if (!prefs.enabled || !prefs.smsVerify || !prefs.watchSms) return
      val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
      if (parts.isEmpty()) return
      val sender = parts[0].originatingAddress ?: return
      // Long SMS arrive in several parts; join them back into one message.
      val body = parts.joinToString("") { it.messageBody ?: "" }
      if (!MONEY.containsMatchIn(body)) return

      val now = System.currentTimeMillis()
      val obj = JSONObject()
      obj.put("id", "sms|$sender|${parts[0].timestampMillis}|${body.hashCode()}")
      obj.put("pkg", "sms")
      obj.put("title", sender)
      obj.put("text", body)
      obj.put("postTime", now)
      obj.put("origin", "sms")
      obj.put("sender", sender)
      EventBuffer.push(context, obj)
      android.util.Log.i("SoundboxTiming", "sms buffered from=$sender at=$now")
      prefs.lastEventAt = now
      prefs.lastEventPkg = "sms:$sender"
      HeadlessStarter.trigger(context.applicationContext)
      KeepAliveService.start(context)
    } catch (e: Exception) {
      Log.w("SoundboxSms", "Failed to read SMS", e)
    }
  }
}
