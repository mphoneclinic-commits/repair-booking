import styles from '../admin.module.css'

export default function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryValue}>{value}</div>
    </div>
  )
}