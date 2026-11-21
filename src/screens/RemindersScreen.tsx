import React, {useState} from 'react';
import {Alert, StyleSheet, TextInput, View} from 'react-native';
import {Button, Card, Icon, IconBtn, T, Tap} from '../components/ui';
import {Screen} from '../components/Screen';
import {toast} from '../components/Toast';
import {ReminderScheduler} from '../native/Soundbox';
import {SpeechInput} from '../native/SpeechInput';
import {readJSON, uid, writeJSON} from '../store/storage';
import {useTheme} from '../theme';

type Reminder = {id: string; text: string; at: number};
const KEY = 'reminders.v1';
const load = () => readJSON<Reminder[]>(KEY, []).filter(x => x.at > Date.now()).sort((a, b) => a.at - b.at);
const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function RemindersScreen() {
  const {c} = useTheme();
  const tomorrow = new Date(Date.now() + 86400000);
  const [text, setText] = useState('');
  const [date, setDate] = useState(dateStr(tomorrow));
  const [time, setTime] = useState('09:00');
  const [items, setItems] = useState(load);
  const [listening, setListening] = useState(false);

  const save = async () => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!text.trim()) return toast('Add a reminder message first', 'error');
    if (!match || !tm) return toast('Use date YYYY-MM-DD and time HH:MM', 'error');
    const at = new Date(+match[1], +match[2] - 1, +match[3], +tm[1], +tm[2]).getTime();
    if (!Number.isFinite(at) || at <= Date.now()) return toast('Choose a future date and time', 'error');
    if (!ReminderScheduler.available) return toast('Scheduled voice reminders are currently available on Android', 'error');
    const reminder = {id: uid(), text: text.trim(), at};
    const next = [...items, reminder].sort((a, b) => a.at - b.at);
    try {
      await ReminderScheduler.schedule(reminder.id, reminder.text, at);
      writeJSON(KEY, next);
      setItems(next); setText('');
      toast('Reminder saved. I’ll read it aloud at that time.', 'success');
    } catch {
      toast('Could not schedule this reminder', 'error');
    }
  };

  const dictate = async () => {
    if (!SpeechInput.available) return toast('Voice input is unavailable on this device', 'error');
    if (!(await SpeechInput.ensurePermission())) return toast('Microphone permission is needed', 'error');
    setListening(true);
    try { const spoken = await SpeechInput.start('en'); if (spoken.trim()) setText(v => v ? `${v} ${spoken.trim()}` : spoken.trim()); }
    catch { toast('Could not hear that. Try again.', 'error'); }
    finally { setListening(false); }
  };

  const remove = (r: Reminder) => Alert.alert('Delete reminder?', r.text, [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Delete', style: 'destructive', onPress: () => {
      const next = items.filter(x => x.id !== r.id); writeJSON(KEY, next); setItems(next); void ReminderScheduler.cancel(r.id);
    }},
  ]);

  const field = {borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, borderRadius: 14, backgroundColor: c.cardAlt, color: c.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16};
  return <Screen title="Reminders" subtitle="Set a time and I’ll say your message aloud." back>
    <Card style={{marginBottom: 20}}>
      <T v="small" mute style={{marginBottom: 8}}>WHAT SHOULD I REMIND YOU?</T>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <TextInput value={text} onChangeText={setText} placeholder="e.g. Call the supplier" placeholderTextColor={c.textMute} multiline style={[field, {flex: 1, minHeight: 88, textAlignVertical: 'top'}]} />
        <IconBtn name={listening ? 'microphone' : 'microphone-outline'} color={listening ? c.danger : c.primary} onPress={dictate} />
      </View>
      <T v="tiny" mute style={{marginTop: 6}}>Tap the microphone to dictate your reminder.</T>
      <View style={{flexDirection: 'row', gap: 10, marginTop: 18}}>
        <View style={{flex: 1}}><T v="tiny" mute style={{marginBottom: 6}}>DATE</T><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMute} style={field} /></View>
        <View style={{width: 112}}><T v="tiny" mute style={{marginBottom: 6}}>TIME</T><TextInput value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={c.textMute} style={field} /></View>
      </View>
      <Button title="Save reminder" icon="bell-plus-outline" onPress={save} style={{marginTop: 16}} />
    </Card>

    <T v="h3" style={{marginBottom: 10}}>Upcoming</T>
    {items.length === 0 ? <Card style={{alignItems: 'center', paddingVertical: 24}}><Icon name="calendar-check-outline" size={30} color={c.textMute} /><T v="small" mute style={{marginTop: 8}}>No upcoming reminders</T></Card> : items.map(r => <Card key={r.id} style={{flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10}}>
      <View style={{width: 40, height: 40, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center'}}><Icon name="bell-outline" color={c.primary} /></View>
      <View style={{flex: 1}}><T v="body" style={{fontWeight: '700'}}>{r.text}</T><T v="small" mute style={{marginTop: 3}}>{new Date(r.at).toLocaleString()}</T></View>
      <Tap onPress={() => remove(r)}><Icon name="trash-can-outline" color={c.danger} /></Tap>
    </Card>)}
  </Screen>;
}
