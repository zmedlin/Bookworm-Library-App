import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fromIsoDate, toIsoDate } from '../lib/dates';

/** Opens Android's date picker dialog and calls onPick with 'YYYY-MM-DD'. */
export function pickDate(currentIso: string, onPick: (iso: string) => void, minIso?: string) {
  DateTimePickerAndroid.open({
    value: fromIsoDate(currentIso),
    mode: 'date',
    minimumDate: minIso ? fromIsoDate(minIso) : undefined,
    onChange: (event, date) => {
      if (event.type === 'set' && date) onPick(toIsoDate(date));
    },
  });
}
