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
    name: 'Champion Customers',
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
    name: 'Discount Shoppers',
    slug: 'discount_shoppers',
    type: 'default',
    description: 'Customers who predominantly buy during sales or with coupons.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'discount_order_percentage', operator: 'greater_than', value: 50 },
        { field: 'total_orders', operator: 'greater_than', value: 2 },
      ],
    },
  },
  {
    name: 'Window Shoppers',
    slug: 'window_shoppers',
    type: 'default',
    description: 'Registered customers with no purchases.',
    filters: {
      logic: 'AND',
      rules: [
        { field: 'total_orders', operator: 'is', value: 0 },
        { field: 'days_since_first_seen', operator: 'greater_than', value: 7 },
      ],
    },
  },
]
