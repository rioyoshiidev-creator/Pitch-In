import type { AlarmTiming } from '../types'

export type AlarmOption = { label: string; alarmTiming: AlarmTiming; minutesBefore: number }

export const ALARM_OPTIONS: AlarmOption[] = [
  { label: '発表時', alarmTiming: 'lineup', minutesBefore: 0 },
  { label: '開始時', alarmTiming: 'before_kickoff', minutesBefore: 0 },
  { label: '5分前', alarmTiming: 'before_kickoff', minutesBefore: 5 },
  { label: '10分前', alarmTiming: 'before_kickoff', minutesBefore: 10 },
  { label: '15分前', alarmTiming: 'before_kickoff', minutesBefore: 15 },
  { label: '20分前', alarmTiming: 'before_kickoff', minutesBefore: 20 },
  { label: '25分前', alarmTiming: 'before_kickoff', minutesBefore: 25 },
  { label: '30分前', alarmTiming: 'before_kickoff', minutesBefore: 30 },
]

export function isSameOption(opt: AlarmOption, timing: AlarmTiming, minutes: number) {
  return opt.alarmTiming === timing && opt.minutesBefore === minutes
}
