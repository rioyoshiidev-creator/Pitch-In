export interface SoundOption {
  label: string
  value: string | undefined
}

// soundName は iOS バンドル内の .caf ファイル名（拡張子なし）
// undefined = AlarmKit デフォルト音（システムアラーム音）
export const ALARM_SOUNDS: SoundOption[] = [
  { label: 'デフォルト', value: undefined },
]

export const ALARM_SOUND_KEY = '@pitchin/alarm_sound'
