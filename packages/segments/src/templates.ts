import type { FilterConfig } from '@storees/shared'

type SegmentTemplate = {
  name: string
  slug: string
  type: 'default'
  description: string
  filters: FilterConfig
}

export const SEGMENT_TEMPLATE_DEFINITIONS: SegmentTemplate[] = [
  {
    name: 'Champions',
    slug: 'champion_customers',
    type: 'default',
    description: 'Highest value customers — ordered recently, frequently, and spent the most.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'total_orders', operator: 'greater_than', value: 5 },
        { field: 'total_spent', operator: 'greater_than', value: 10000 },
        { field: 'days_since_last_order', operator: 'less_than', value: 30 },
      ],
    },
  },
  {
    name: 'Loyal Customers',
    slug: 'loyal_customers',
    type: 'default',
    description: 'Regular buyers with consistent purchase patterns.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'total_orders', operator: 'greater_than', value: 3 },
        { field: 'days_since_last_order', operator: 'less_than', value: 60 },
      ],
    },
  },
  {
    name: 'New Buyers',
    slug: 'new_buyers',
    type: 'default',
    description: 'Customers who started purchasing recently — 1 to 3 orders, active within last 60 days.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'total_orders', operator: 'greater_than', value: 0 },
        { field: 'total_orders', operator: 'less_than', value: 4 },
        { field: 'days_since_last_order', operator: 'less_than', value: 60 },
      ],
    },
  },
  {
    name: 'At Risk',
    slug: 'at_risk',
    type: 'default',
    description: 'Previously active buyers who haven\'t ordered in 60+ days.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'total_orders', operator: 'greater_than', value: 0 },
        { field: 'days_since_last_order', operator: 'greater_than', value: 59 },
      ],
    },
  },
  {
    name: 'Window Shoppers',
    slug: 'window_shoppers',
    type: 'default',
    description: 'Registered contacts with no purchases yet.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'total_orders', operator: 'is', value: 0 },
      ],
    },
  },
  {
    name: 'Overdue Reorders',
    slug: 'overdue_reorders',
    type: 'default',
    description: 'Repeat buyers past their expected reorder date.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'days_overdue', operator: 'greater_than', value: 0 },
        { field: 'total_orders', operator: 'greater_than', value: 1 },
      ],
    },
  },
]
