import type { SaveState } from '../types'
import styles from '../admin.module.css'

export default function SaveIndicator({
  state,
  compact = false,
}: {
  state: SaveState
  compact?: boolean
}) {
  const classNames = [
    styles.saveIndicator,
    compact ? styles.saveIndicatorCompact : '',
    state === 'dirty'
      ? styles.saveDirty
      : state === 'saving'
        ? styles.saveSaving
        : state === 'saved'
          ? styles.saveSaved
          : state === 'error'
            ? styles.saveError
            : styles.saveIdle,
  ]
    .filter(Boolean)
    .join(' ')

  let text = ' '

  if (state === 'dirty') text = 'Typing...'
  if (state === 'saving') text = 'Saving...'
  if (state === 'saved') text = 'Saved'
  if (state === 'error') text = 'Failed'

  return <span className={classNames}>{text}</span>
}